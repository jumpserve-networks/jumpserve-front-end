import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';
import React from 'react';
import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import * as Alert from '../app/components/ui/alert-dialog.tsx';
import * as Sheet from '../app/components/ui/sheet.tsx';
import * as Dialog from '../app/components/ui/dialog.tsx';
import * as Popover from '../app/components/ui/popover.tsx';
import * as Tabs from '../app/components/ui/tabs.tsx';
import * as Select from '../app/components/ui/select.tsx';
import {FilterDropdown} from '../app/components/ui/filter-dropdown.tsx';
import {Toggle} from '../app/components/ui/toggle.tsx';
import * as Card from '../app/components/ui/card.tsx';
import * as Table from '../app/components/ui/table.tsx';
import {Button} from '../app/components/ui/button.tsx';

const h = React.createElement;
afterEach(cleanup);
const click = async element => {await act(async () => {fireEvent.click(element);});};

test('button consumers can derive their class from the primitive state',()=>{
 render(h(Button,{className:state=>state.disabled?'disabled-consumer':'enabled-consumer'},'Stateful action'));
 assert.ok(screen.getByRole('button',{name:'Stateful action'}).classList.contains('enabled-consumer'));
});

test('shared report surfaces retain table semantics action controls and pressed toggle state',async()=>{
 let pressed=false;
 render(h(Card.Card,{'aria-label':'Recorded measurements'},h(Card.CardHeader,null,h(Card.CardTitle,null,'Original report'),h(Card.CardDescription,null,'Missing is not zero'),h(Card.CardAction,null,h(Toggle,{'aria-label':'Show exclusions',variant:'outline',size:'sm',onPressedChange:value=>{pressed=value;}},'Exclusions'))),h(Card.CardContent,null,h(Table.Table,null,h(Table.TableCaption,null,'Original trial totals'),h(Table.TableHeader,null,h(Table.TableRow,null,h(Table.TableHead,{scope:'col'},'Trials'))),h(Table.TableBody,null,h(Table.TableRow,null,h(Table.TableCell,null,'0'))),h(Table.TableFooter,{className:'consumer-totals'},h(Table.TableRow,null,h(Table.TableCell,null,'Recorded total: 0'))))),h(Card.CardFooter,null,'Original provenance retained')));
 const table=screen.getByRole('table',{name:'Original trial totals'});assert.equal(table.querySelector('tfoot').textContent,'Recorded total: 0');assert.ok(table.querySelector('tfoot').classList.contains('consumer-totals'));assert.equal(screen.getByRole('columnheader',{name:'Trials'}).getAttribute('scope'),'col');assert.equal(screen.getByRole('cell',{name:'0',exact:true}).textContent,'0');const toggle=screen.getByRole('button',{name:'Show exclusions'});await click(toggle);assert.equal(pressed,true);assert.equal(toggle.getAttribute('aria-pressed'),'true');cleanup();
 render(h(Toggle,{'aria-label':'Default toggle'},'Default'));assert.equal(screen.getByRole('button',{name:'Default toggle'}).getAttribute('aria-pressed'),'false');
});

test('alert dialogs retain accessible labels and separate confirmation from cancellation', async () => {
  let confirmed = 0;
  render(h(Alert.AlertDialog, null, h(Alert.AlertDialogTrigger, null, 'Delete synthetic item'),
    h(Alert.AlertDialogContent, {className: 'consumer-content'}, h(Alert.AlertDialogHeader, null,
      h(Alert.AlertDialogMedia, {'aria-hidden': true}, '!'), h(Alert.AlertDialogTitle, null, 'Delete this item?'), h(Alert.AlertDialogDescription, null, 'Original evidence remains retained.')),
    h(Alert.AlertDialogFooter, null, h(Alert.AlertDialogAction, {onClick: () => confirmed++}, 'Confirm deletion'), h(Alert.AlertDialogCancel, null, 'Keep item')))));
  assert.equal(screen.queryByRole('alertdialog'), null); await click(screen.getByRole('button', {name: 'Delete synthetic item'}));
  const dialog = screen.getByRole('alertdialog', {name: 'Delete this item?'}); assert.equal(dialog.getAttribute('data-size'), 'default'); assert.ok(dialog.classList.contains('consumer-content')); assert.equal(dialog.getAttribute('aria-describedby'), within(dialog).getByText('Original evidence remains retained.').id);
  await click(within(dialog).getByRole('button', {name: 'Confirm deletion'})); assert.equal(confirmed, 1); assert.ok(screen.getByRole('alertdialog'));
  await click(within(dialog).getByRole('button', {name: 'Keep item'})); await waitFor(() => assert.equal(screen.queryByRole('alertdialog'), null));
});

test('small alerts preserve explicit cancel button variants and never invoke the action on cancel', async () => {
  let confirmed = false;
  render(h(Alert.AlertDialog, {defaultOpen: true}, h(Alert.AlertDialogContent, {size: 'sm'}, h(Alert.AlertDialogHeader, null, h(Alert.AlertDialogTitle, null, 'Small confirmation'), h(Alert.AlertDialogDescription, null, 'Synthetic description')), h(Alert.AlertDialogFooter, null, h(Alert.AlertDialogAction, {onClick: () => {confirmed = true;}}, 'Confirm'), h(Alert.AlertDialogCancel, {variant: 'secondary', size: 'sm'}, 'Cancel')))));
  assert.equal(screen.getByRole('alertdialog').getAttribute('data-size'), 'sm'); await click(screen.getByRole('button', {name: 'Cancel', exact: true})); assert.equal(confirmed, false); await waitFor(() => assert.equal(screen.queryByRole('alertdialog'), null));
});

test('sheet placement and close controls preserve labels description and explicit dismissal', async () => {
  for (const side of [undefined, 'left', 'top', 'bottom']) {
    const options = side ? {side, showCloseButton: false} : {};
    const view = render(h(Sheet.Sheet, null, h(Sheet.SheetTrigger, null, 'Open navigation'), h(Sheet.SheetContent, options, h(Sheet.SheetHeader, null, h(Sheet.SheetTitle, null, 'Research navigation'), h(Sheet.SheetDescription, null, 'Available modules')), h('a', {href: '/research-verification/assessments'}, 'Assessments'), h(Sheet.SheetFooter, null, h(Sheet.SheetClose, null, 'Dismiss navigation')))));
    await click(screen.getByRole('button', {name: 'Open navigation'})); const dialog = screen.getByRole('dialog', {name: 'Research navigation'}); assert.equal(dialog.getAttribute('data-side'), side ?? 'right'); assert.equal(within(dialog).getByRole('link', {name: 'Assessments'}).getAttribute('href'), '/research-verification/assessments'); assert.equal(dialog.getAttribute('aria-describedby'), within(dialog).getByText('Available modules').id);
    if (side) assert.equal(within(dialog).queryByRole('button', {name: 'Close', exact: true}), null);
    else assert.ok(within(dialog).getByRole('button', {name: 'Close', exact: true}));
    await click(within(dialog).getByRole('button', {name: 'Dismiss navigation'})); await waitFor(() => assert.equal(screen.queryByRole('dialog'), null)); view.unmount();
  }
});

test('dialog content and optional footer controls close only the selected modal', async () => {
  for (const footerClose of [false, true]) {
    const view = render(h(Dialog.Dialog, null, h(Dialog.DialogTrigger, null, 'Open details'), h(Dialog.DialogContent, {showCloseButton: !footerClose}, h(Dialog.DialogHeader, null, h(Dialog.DialogTitle, null, 'Retained details'), h(Dialog.DialogDescription, null, 'Read-only recorded configuration')), h(Dialog.DialogFooter, {showCloseButton: footerClose}, h(Dialog.DialogClose, null, 'Dismiss details')))));
    await click(screen.getByRole('button', {name: 'Open details'})); const dialog = screen.getByRole('dialog', {name: 'Retained details'}); assert.equal(dialog.getAttribute('aria-describedby'), within(dialog).getByText('Read-only recorded configuration').id); assert.ok(within(dialog).getByRole('button', {name: 'Close', exact: true})); await click(within(dialog).getByRole('button', {name: footerClose ? 'Close' : 'Dismiss details', exact: true})); await waitFor(() => assert.equal(screen.queryByRole('dialog'), null)); view.unmount();
  }
});

test('popover wrappers expose their title description and consumer alignment without losing the trigger', async () => {
  render(h(Popover.Popover, null, h(Popover.PopoverTrigger, null, 'Open filter details'), h(Popover.PopoverContent, {align: 'start', side: 'top', sideOffset: 8, alignOffset: 2, className: 'consumer-popover'}, h(Popover.PopoverHeader, null, h(Popover.PopoverTitle, null, 'Filter details'), h(Popover.PopoverDescription, null, 'Choose recorded settings')), h('input', {'aria-label': 'Recorded setting'}))));
  await click(screen.getByRole('button', {name: 'Open filter details'})); const content = screen.getByText('Filter details').closest('[data-slot="popover-content"]'); assert.ok(content); assert.ok(content.classList.contains('consumer-popover')); assert.ok(within(content).getByRole('textbox', {name: 'Recorded setting'})); assert.equal(screen.getByRole('button', {name: 'Open filter details'}).getAttribute('aria-expanded'), 'true');
});

test('filter dropdown retains its accessible label selected summary and grouped controls', async () => {
  render(h(FilterDropdown, {label: 'Algorithms', summary: 'BBR and CUBIC', className: 'consumer-filter'}, h('label', null, h('input', {type: 'checkbox'}), 'CUBIC')));
  const trigger = screen.getByRole('button', {name: /Algorithms: BBR and CUBIC/}); assert.ok(trigger.classList.contains('consumer-filter')); await click(trigger); assert.ok(screen.getByText('Algorithms filters')); const checkbox = screen.getByRole('checkbox', {name: 'CUBIC'}); fireEvent.click(checkbox); assert.equal(checkbox.checked, true); assert.equal(trigger.getAttribute('aria-expanded'), 'true');
});

test('tabs forward selected values and orientation to accessible keyboard navigation', async () => {
  for (const orientation of [undefined, 'vertical']) {
    let value = null;
    const view = render(h(Tabs.Tabs, {defaultValue: 'first', ...(orientation ? {orientation} : {}), onValueChange: next => {value = next;}}, h(Tabs.TabsList, {variant: orientation ? 'line' : 'default', 'aria-label': 'Assessment views'}, h(Tabs.TabsTrigger, {value: 'first'}, 'Summary'), h(Tabs.TabsTrigger, {value: 'second'}, 'Measurements')), h(Tabs.TabsContent, {value: 'first'}, 'Recorded summary'), h(Tabs.TabsContent, {value: 'second'}, 'Recorded measurements')));
    const list = screen.getByRole('tablist', {name: 'Assessment views'}); assert.equal(list.getAttribute('aria-orientation') ?? 'horizontal', orientation ?? 'horizontal'); assert.equal(screen.getByRole('tab', {name: 'Summary'}).getAttribute('aria-selected'), 'true');
    if (orientation === 'vertical') {const summary = screen.getByRole('tab', {name: 'Summary'}); await act(async () => {summary.focus(); fireEvent.keyDown(summary, {key: 'ArrowDown'});}); assert.equal(document.activeElement, screen.getByRole('tab', {name: 'Measurements'}));}
    await click(screen.getByRole('tab', {name: 'Measurements'})); assert.equal(value, 'second'); assert.equal(screen.getByRole('tabpanel').textContent, 'Recorded measurements'); assert.equal(screen.getByRole('tab', {name: 'Measurements'}).getAttribute('aria-selected'), 'true'); view.unmount();
  }
});

test('select wrappers retain option labels group separator and chosen value through the popup', async () => {
  let selected = null;
  render(h(Select.Select, {defaultValue: 'all', items: [{value: 'all', label: 'All assessments'}, {value: 'mine', label: 'My assessments'}], onValueChange: value => {selected = value;}}, h(Select.SelectTrigger, {'aria-label': 'Assessment ownership', size: 'sm'}, h(Select.SelectValue)), h(Select.SelectContent, {alignItemWithTrigger: false, side: 'bottom', align: 'start'}, h(Select.SelectGroup, null, h(Select.SelectLabel, null, 'Ownership'), h(Select.SelectItem, {value: 'all'}, 'All assessments'), h(Select.SelectSeparator), h(Select.SelectItem, {value: 'mine'}, 'My assessments')))));
  const trigger = screen.getByRole('combobox', {name: 'Assessment ownership'}); assert.equal(trigger.getAttribute('data-size'), 'sm'); await click(trigger); assert.ok(screen.getByText('Ownership')); assert.ok(document.querySelector('[data-slot="select-separator"]')); assert.equal(screen.getAllByRole('option').length, 2);
  const option = screen.getByRole('option', {name: 'My assessments'}); await act(async () => {fireEvent.pointerDown(option, {pointerType: 'mouse', button: 0, buttons: 1}); fireEvent.click(option, {detail: 1});}); assert.equal(selected, 'mine'); assert.match(trigger.textContent, /My assessments/);
});
