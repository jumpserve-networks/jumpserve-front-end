"""Save the exact private Step 1 PDF issued for a JumpServe assessment ID."""

import argparse
from hashlib import sha256
from http.client import HTTPConnection, HTTPSConnection, HTTPException
import json
import os
from pathlib import Path
import re
from socket import gaierror
import ssl
import sys
from tempfile import NamedTemporaryFile
from urllib.parse import parse_qs, urlsplit

UUID = r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}"


def paper_identity(assessment_id, ticket):
    filename = f"paper-{assessment_id}.pdf"
    digest = ticket.get("sha256", "")
    size = ticket.get("byte_count")
    if (not re.fullmatch(UUID, assessment_id) or ticket.get("assessment_id") != assessment_id or
            ticket.get("filename") != filename or not isinstance(digest, str) or
            not re.fullmatch(r"[0-9a-f]{64}", digest) or
            type(size) is not int or not 1 <= size <= 10_000_000):
        raise ValueError("The download ticket does not identify this assessment's PDF.")
    return filename, digest, size


def fetch_pdf(ticket, filename, digest, size):
    try:
        url = urlsplit(ticket.get("download_url", ""))
        port = url.port
        query = parse_qs(url.query, strict_parsing=True)
    except ValueError:
        raise ValueError("The signed PDF download URL is invalid.") from None
    loopback = url.scheme == "http" and url.hostname in ("localhost", "127.0.0.1", "::1")
    trusted = url.scheme == "https" and port in (None, 443) and re.fullmatch(r"[a-z0-9]+\.supabase\.co", url.hostname or "")
    object_path = rf"/storage/v1/object/sign/research-paper-uploads/local-assessment-sources/{UUID}/{digest}\.pdf"
    if (not (trusted or loopback) or url.username is not None or url.password is not None or url.fragment or
            not re.fullmatch(object_path, url.path) or set(query) != {"token", "download"} or
            len(query["token"]) != 1 or query["download"] != [filename]):
        raise ValueError("The signed PDF download URL is invalid.")

    connection = None
    try:
        if loopback:
            connection = HTTPConnection(url.hostname, port, timeout=30)
        else:
            context = ssl.create_default_context()
            certs = Path("/etc/ssl/cert.pem")
            if sys.platform == "darwin" and certs.is_file() and not (os.getenv("SSL_CERT_FILE") or os.getenv("SSL_CERT_DIR")):
                context.load_verify_locations(cafile=str(certs))
            connection = HTTPSConnection(url.hostname, port, timeout=30, context=context)
        connection.request("GET", f"{url.path}?{url.query}", headers={"Accept": "application/pdf"})
        response = connection.getresponse()
        if response.status != 200:
            raise ValueError(f"PDF download returned HTTP {response.status}. Request a fresh ticket for the same assessment ID.")
        return response.read(size + 1)
    except gaierror:
        raise ValueError("PDF download could not resolve the storage host (DNS). Check the active network permissions.") from None
    except PermissionError:
        raise ValueError("Local network permissions blocked access to the PDF storage host.") from None
    except ssl.SSLError:
        raise ValueError("PDF download could not establish a verified TLS connection to storage.") from None
    except (OSError, HTTPException):
        raise ValueError("PDF download could not complete the connection to storage.") from None
    finally:
        if connection is not None:
            connection.close()


def download(assessment_id, out, ticket, local_file=None):
    filename, digest, size = paper_identity(assessment_id, ticket)
    if local_file is None:
        data = fetch_pdf(ticket, filename, digest, size)
    else:
        try:
            with local_file.open("rb") as source:
                data = source.read(size + 1)
        except OSError:
            raise ValueError("Could not read the selected local PDF file.") from None
    if len(data) != size or not data[:1024].lstrip().startswith(b"%PDF-") or sha256(data).hexdigest() != digest:
        raise ValueError("The PDF bytes do not match the assessment PDF.")

    saved_path = None
    try:
        with NamedTemporaryFile(dir=out.parent, delete=False) as saved:
            saved_path = Path(saved.name)
            saved.write(data)
        os.link(saved_path, out)
    except FileExistsError:
        with out.open("rb") as existing:
            if existing.read(size + 1) != data:
                raise ValueError("The output path already contains a different file. Choose a new local path.") from None
    finally:
        if saved_path is not None:
            saved_path.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assessment-id", required=True)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--from-file", type=Path, help="Verify and save an existing local PDF without network access.")
    args = parser.parse_args()
    try:
        download(args.assessment_id, args.out, json.load(sys.stdin), args.from_file)
    except OSError:
        parser.exit(1, "Could not save the verified PDF. Check the local destination and its write permissions.\n")
    except (AttributeError, TypeError, json.JSONDecodeError):
        parser.exit(1, "Supply the private JumpServe download ticket on standard input.\n")
    except ValueError as error:
        parser.exit(1, f"{error}\n")
    print("Verified assessment PDF saved.")


if __name__ == "__main__":
    main()
