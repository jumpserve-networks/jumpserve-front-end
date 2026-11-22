"""Upload a verified local PDF with an exact JumpServe preview's upload ticket."""

import argparse
from hashlib import sha256
from http.client import HTTPConnection, HTTPSConnection, HTTPException
import json
import os
from pathlib import Path
import re
import ssl
import sys
from urllib.parse import parse_qs, urlsplit


def upload(pdf, bundle, ticket):
    paper = bundle["paper"]
    size = paper["byte_count"]
    if paper.get("pdf_copy") is not True or not isinstance(size, int) or not 1 <= size <= 10_000_000:
        raise ValueError("The assessment bundle needs a PDF copy and its exact byte count.")
    with pdf.open("rb") as source:
        original = source.read(size + 1)
    if len(original) != size or not original[:1024].lstrip().startswith(b"%PDF-") or sha256(original).hexdigest() != paper["sha256"]:
        raise ValueError("The supplied PDF differs from the paper in the assessment bundle.")

    preview = ticket.get("preview_id", "")
    invalid_ticket = "Use the signed PDF upload ticket returned by JumpServe for this preview."
    try:
        url = urlsplit(ticket.get("upload_url", ""))
        port = url.port
        query = parse_qs(url.query, strict_parsing=True)
    except ValueError:
        raise ValueError(invalid_ticket) from None
    loopback = url.scheme == "http" and url.hostname in ("localhost", "127.0.0.1", "::1")
    expected = f"/storage/v1/object/upload/sign/research-paper-uploads/jumpserve-mcp/{preview}.pdf"
    if (ticket.get("status") != "pdf_upload_required" or
        not re.fullmatch(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", preview) or
        not url.hostname or (url.scheme != "https" and not loopback) or
        url.username is not None or url.password is not None or url.fragment or url.path != expected or
        set(query) != {"token"} or len(query["token"]) != 1):
        raise ValueError(invalid_ticket)

    if loopback:
        connection = HTTPConnection(url.hostname, port, timeout=120)
    else:
        context = ssl.create_default_context()
        system_bundle = Path("/etc/ssl/cert.pem")
        if (sys.platform == "darwin" and system_bundle.is_file() and
                not (os.getenv("SSL_CERT_FILE") or os.getenv("SSL_CERT_DIR"))):
            context.load_verify_locations(cafile=str(system_bundle))
        connection = HTTPSConnection(url.hostname, port, context=context, timeout=120)
    try:
        connection.request("PUT", f"{url.path}?{url.query}", original, headers={
            "Content-Type": "application/pdf", "Cache-Control": "max-age=0", "x-upsert": "false",
        })
        status = connection.getresponse().status
    finally:
        connection.close()
    if not 200 <= status < 300:
        raise ValueError(f"PDF upload returned HTTP {status}. Check the same bundle with JumpServe before retrying.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", required=True, type=Path)
    parser.add_argument("--bundle", required=True, type=Path)
    args = parser.parse_args()
    try:
        ticket = json.load(sys.stdin)
        bundle = json.loads(args.bundle.read_text(encoding="utf-8"))
        upload(args.pdf, bundle, ticket)
    except (OSError, HTTPException):
        parser.exit(1, "PDF upload could not be confirmed. Check the same bundle with JumpServe before retrying.\n")
    except (KeyError, AttributeError, TypeError, json.JSONDecodeError):
        parser.exit(1, "Supply the saved assessment bundle and JumpServe's PDF upload ticket.\n")
    except ValueError as error:
        parser.exit(1, f"{error}\n")
    print("PDF uploaded. Call preview_assessment again with the same bundle.")


if __name__ == "__main__":
    main()
