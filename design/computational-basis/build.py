"""Generate the Computational Basis design frames as Figma-importable SVG.

    python build.py

Writes one .svg per screen/state into this folder. Drag them into Figma: each file
lands as a frame whose groups and text layers stay editable.
"""

import os

from figma_kit import (C, CONTENT_W, CONTENT_X, MONO, TOPBAR_H, W, Frame, button,
                       card, chip, ellipsize, field, input_box, n, status_pill,
                       switch, table_header, textarea, tw)
import chrome as ch

OUT = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------- shared bits

def source_chip(f, x, cy, built_in=True):
    """.computation-source — 21px pill, violet for built-in, amber for admin-defined."""
    label = 'Built-in' if built_in else 'Admin-defined'
    bg, ink = ('#f0e8fb', '#5b2b96') if built_in else ('#fff6d8', '#756018')
    w = 14 + 13 + 4 + tw(label, 7.5, 600)
    f.rect(x, cy - 10.5, w, 21, fill=bg, rx=10.5)
    f.icon('function', x + 7, cy - 6.5, 13, ink)
    f.textc(x + 7 + 17, cy, label, 7.5, fill=ink, weight=600)
    return w


def row_action(f, x, cy, icon, locked=False):
    """.row-actions button — 26px hit area, violet glyph."""
    f.icon(icon, x + 5.5, cy - 7.5, 15, '#a99cb8' if locked else C['violet'])
    return 26 + 3


def toolbar_search(f, x, cy, width, placeholder):
    f.rect(x, cy - 20, width, 40, fill=C['white'], stroke=C['searchLine'], rx=4)
    f.textc(x + 13, cy, placeholder, 11, fill=C['muted'])
    f.icon('magnifier', x + width - 12 - 18, cy - 9, 18, C['violet'])


def compact_select(f, x, cy, value, width=150):
    input_box(f, x, cy - 18.5, width, value, height=37, font=10, caret=True)
    return width


def library_notice(f, y):
    """.library-notice — the Client Admin read-only advisory."""
    f.rect(CONTENT_X, y, CONTENT_W, 46, fill=C['noticeBg'], stroke=C['noticeLine'], rx=6)
    f.icon('lock', CONTENT_X + 13, y + 13, 20, C['violet'])
    f.textc(CONTENT_X + 43, y + 16,
            'Built-in formulas are read-only; company calculations are editable here.',
            9, fill=C['violet'], weight=600)
    f.textc(CONTENT_X + 43, y + 30,
            'Create a governed computation with the approved field and operator palette, '
            'then assign it to the applicable employee group.', 9, fill=C['noticeInk'])
    return y + 46


def pagination(f, y, shown, total, noun, page=1, pages=22):
    """.pagination — 30px controls, right aligned."""
    f.textc(CONTENT_X, y + 15, 'Displaying %s of %s %s' % (shown, total, noun), 10,
            fill=C['pageInk'])
    x = CONTENT_X + CONTENT_W - (5 * 30 + 4 * 5 + tw('of %s' % pages, 10) + 5)
    for glyph, dim in (('«', True), ('‹', True)):
        f.rect(x, y, 30, 29, fill=C['white'], stroke=C['pagerLine'], rx=3)
        f.textc(x + 15, y + 14.5, glyph, 11, fill=C['violet'], anchor='middle')
        x += 35
    f.rect(x, y, 30, 29, fill=C['white'], stroke=C['pagerLine'], rx=3)
    f.textc(x + 15, y + 14.5, str(page), 10, fill=C['violet'], weight=600, anchor='middle')
    x += 35
    f.textc(x, y + 14.5, 'of %s' % pages, 10, fill=C['pageInk'])
    x += tw('of %s' % pages, 10) + 5
    for glyph in ('›', '»'):
        f.rect(x, y, 30, 29, fill=C['white'], stroke=C['pagerLine'], rx=3)
        f.textc(x + 15, y + 14.5, glyph, 11, fill=C['violet'], anchor='middle')
        x += 35
    return y + 29


def _card_markup(x, y, w, h, rx=8):
    """A .policy-config-card border as a string, for backfilling a reserved slot."""
    return ('<rect x="%s" y="%s" width="%s" height="%s" rx="%s" fill="%s" stroke="%s" '
            'stroke-width="1"/>' % (n(x), n(y), n(w), n(h), n(rx), C['white'], C['line']))


def backdrop(f, height):
    """.modal-backdrop — rgba(26,23,31,.62) over the workspace."""
    f.rect(0, 0, W, height, fill=C['backdrop'], opacity=0.62, name='Backdrop')


def modal_shell(f, x, y, width, height, title, tag=None):
    """.modal — 2px violet border, 58px header with a close button."""
    f.rect(x, y, width, height, fill=C['white'], stroke=C['violet'], sw=2, rx=3)
    f.textc(x + 18, y + 29, title, 17, weight=500)
    f.line(x, y + 58, x + width, y + 58, '#e6e4ea')
    f.icon('x', x + width - 18 - 30.5, y + 29 - 10.5, 21, C['ink'])
    return y + 58


def sticky_actions(f, x, y, width, buttons):
    """.modal-actions.sticky-actions — 13px/18px band with a top rule."""
    f.rect(x + 1.5, y + 1, width - 3, 61, fill=C['white'])
    f.line(x, y, x + width, y, C['line'])
    cy = y + 13 + 19
    right = x + width - 18
    for label, kind, icon in reversed(buttons):
        bw = 30 + tw(label, 11, 500) + (22 if icon else 0)
        button(f, right - bw, cy, label, kind, icon=icon)
        right -= bw + 9
    return y + 64


def annotate(f, x, y, text, width=520):
    """Spec note in the frame margin — delete the 'Notes' group in Figma if unwanted."""
    f.open('Notes')
    f.rect(x, y, width, 26 + f.para_h(text, 8.5, width - 24, line_h=12.5),
           fill='#ffffff', stroke=C['noticeLine'], rx=6, opacity=0.92)
    f.para(x + 12, y + 20, text, 8.5, fill=C['noticeInk'], max_w=width - 24, line_h=12.5)
    f.close()


# ------------------------------------------------------------------ frame 01

COMPUTATION_ROWS = [
    ('BAS-001', 'Daily Rate', 'Basic Pay', '{{monthly_basic}} * 12 / {{factor_days}}', 'P&A Admin', 'Aug 8, 2026'),
    ('BAS-002', 'Hourly Rate', 'Basic Pay', '{{daily_rate}} / {{work_hours}}', 'System Standard', 'Jan 1, 2026'),
    ('BAS-003', 'Minute Rate', 'Basic Pay', '{{hourly_rate}} / 60', 'System Standard', 'Jan 1, 2026'),
    ('BAS-004', 'Effective Pay Adjustment', 'Basic Pay', '{{basic_pay}} + {{basic_pay_adjustment}}', 'System Standard', 'Jan 1, 2026'),
    ('MWE-001', 'MWE Pay with ECOLA', 'Basic Pay', '{{daily_rate}} * {{days_worked}} + {{ecola_amount}} * {{days_worked}}', 'P&A Admin', 'Aug 8, 2026'),
    ('ERN-001', 'Basic Pay for Period', 'Earnings', '{{monthly_basic}} / 2', 'System Standard', 'Jan 1, 2026'),
    ('ERN-002', 'Overtime Pay', 'Earnings', '{{hourly_rate}} * {{ot_hours}} * {{ot_rate}}', 'System Standard', 'Jan 1, 2026'),
    ('ERN-003', 'Night Differential', 'Earnings', '{{hourly_rate}} * {{ot_hours}} * 0.10', 'System Standard', 'Jan 1, 2026'),
    ('ERN-004', 'Variable Allowance Adjustment', 'Earnings', '{{taxable_earnings}} / {{days_worked}}', 'P&A Admin', 'Aug 8, 2026'),
    ('ERN-005', 'Variable Allowance by Unit', 'Earnings', '{{allowance_units}} * {{allowance_unit_rate}}', 'System Standard', 'Jan 1, 2026'),
]

BASIS_COLS = [('Code', 88), ('Type', 106), ('Computation', 246), ('Category', 108),
              ('Formula', 350), ('Version', 62), ('Status', 72), ('Action', 96)]


def frame_computations():
    f = Frame('01 Computations')
    y = ch.shell_content(f, 'Computations')

    f.open('Toolbar')
    cy = y + 32.5
    toolbar_search(f, CONTENT_X, cy, 340, 'Search code, computation, or description...')
    x = CONTENT_X + 340 + 9
    x += compact_select(f, x, cy, 'All categories') + 9
    compact_select(f, x, cy, 'All statuses')
    right = CONTENT_X + CONTENT_W
    for label, kind, icon, caret in reversed([
            ('Create computation', 'primary', 'plus', False),
            ('Import CSV', 'secondary', 'upload', False),
            ('Download report', 'secondary', 'download', True)]):
        bw = 30 + tw(label, 11, 500) + 22 + (19 if caret else 0)
        button(f, right - bw, cy, label, kind, icon=icon, caret=caret)
        right -= bw + 7
    f.close()
    y += 65

    f.open('Library notice')
    y = library_notice(f, y) + 10
    f.close()

    f.open('Computations table')
    rows_h = len(COMPUTATION_ROWS) * 41
    hdr_h = 32
    card(f, CONTENT_X, y, CONTENT_W, 10 + hdr_h + rows_h, rx=8)
    tx, ty = CONTENT_X + 10, y + 5
    table_header(f, tx, ty, BASIS_COLS)
    ry = ty + hdr_h
    for code, name, cat, expr, who, when in COMPUTATION_ROWS:
        cx = tx
        cyr = ry + 20.5
        f.textc(cx + 10, cyr, code, 10.5, weight=600)
        cx += BASIS_COLS[0][1]
        source_chip(f, cx + 10, cyr, True)
        cx += BASIS_COLS[1][1]
        f.textc(cx + 10, cyr - 6, name, 9.5, fill=C['titleInk'], weight=600)
        f.textc(cx + 10, cyr + 7, 'Updated %s by %s' % (when, who), 7.5, fill=C['titleSub'])
        cx += BASIS_COLS[2][1]
        f.textc(cx + 10, cyr, cat, 10.5)
        cx += BASIS_COLS[3][1]
        f.textc(cx + 10, cyr, ellipsize(expr, 310, 8, mono=True), 8,
                fill=C['formulaInk'], mono=True)
        cx += BASIS_COLS[4][1]
        f.textc(cx + 10, cyr, '1.0', 10.5)
        cx += BASIS_COLS[5][1]
        status_pill(f, cx + 10, cyr, 'Active')
        cx += BASIS_COLS[6][1]
        ax = cx + BASIS_COLS[7][1] - 10 - 26 * 2 - 3
        ax += row_action(f, ax, cyr, 'eye')
        row_action(f, ax, cyr, 'lock', locked=True)
        f.line(tx, ry + 41, tx + CONTENT_W - 20, ry + 41, C['tdLine'])
        ry += 41
    f.close()
    y += 10 + hdr_h + rows_h + 11

    f.open('Pagination')
    y = pagination(f, y, 10, 219, 'computations')
    f.close()

    annotate(f, CONTENT_X, y + 22,
             'Client Admin role. Built-in rows expose View only; the lock glyph replaces '
             'Edit and Delete and points to Settings › Standard Computation Library. In the '
             'P&A Admin role the same rows show View, Edit and (for company computations) '
             'Delete, and the notice above the table switches to the violet function icon.')
    height = y + 22 + 62 + 28
    ch.shell_frame(f, height)
    return f, height


# ------------------------------------------------------------------ frame 02

ASSIGNMENT_ROWS = [
    ('Government deduction', 'SSS Contribution Table 2026', 'GOV-001', 'SSS Employee Contribution', 'All Employees', 'Every payroll'),
    ('Government deduction', 'PhilHealth Contribution Table 2026', 'GOV-002', 'PhilHealth Employee Contribution', 'All Employees', 'Every payroll'),
    ('Government deduction', 'HDMF Contribution Table 2026', 'GOV-003', 'HDMF Employee Contribution', 'All Employees', 'Every payroll'),
    ('Tax computation', 'BIR Withholding Tax Table 2026', 'TAX-002', 'Withholding Tax', 'Monthly', 'Every payroll'),
    ('Take-home protection', 'Deduction and Loan Hierarchy', 'THP-001', 'Minimum Take-Home Pay', 'All Employees', 'Every payroll'),
    ('Retirement benefit', 'Employee Groups', 'RET-002', 'More Beneficial Retirement Benefit', 'All Employees', 'On retirement'),
]

ASSIGN_COLS = [('Assignment type', 158), ('Reference table', 262), ('Basis of computation', 240),
               ('Employee group', 142), ('Frequency', 130), ('Status', 88), ('Action', 88)]


def frame_assignments():
    f = Frame('02 Client assignments')
    y = ch.shell_content(f, 'Client assignments')

    f.open('Toolbar')
    cy = y + 32.5
    ch.workspace_copy(f, CONTENT_X, cy - 6, 'Client computation assignments',
                      'Connect a standard computation and reference table to an employee '
                      'group and payroll frequency.')
    right = CONTENT_X + CONTENT_W
    for label, kind, icon, caret in reversed([('Add assignment', 'primary', 'plus', False),
                                              ('Download report', 'secondary', 'download', True)]):
        bw = 30 + tw(label, 11, 500) + 22 + (19 if caret else 0)
        button(f, right - bw, cy, label, kind, icon=icon, caret=caret)
        right -= bw + 7
    f.close()
    y += 65

    f.open('Assignments table')
    row_h = 41
    hdr_h = 32
    card(f, CONTENT_X, y, CONTENT_W, 16 + hdr_h + len(ASSIGNMENT_ROWS) * row_h, rx=8)
    tx, ty = CONTENT_X + 14, y + 8
    table_header(f, tx, ty, ASSIGN_COLS)
    ry = ty + hdr_h
    for atype, table, code, cname, group, freq in ASSIGNMENT_ROWS:
        cx, cyr = tx, ry + 20.5
        f.textc(cx + 10, cyr, atype, 10.5)
        cx += ASSIGN_COLS[0][1]
        f.textc(cx + 10, cyr, table, 10.5)
        cx += ASSIGN_COLS[1][1]
        f.textc(cx + 10, cyr - 6, code, 10.5, weight=600)
        f.textc(cx + 10, cyr + 7, ellipsize(cname, 220, 7.5), 7.5, fill=C['titleSub'])
        cx += ASSIGN_COLS[2][1]
        f.textc(cx + 10, cyr, group, 10.5)
        cx += ASSIGN_COLS[3][1]
        f.textc(cx + 10, cyr, freq, 10.5)
        cx += ASSIGN_COLS[4][1]
        status_pill(f, cx + 10, cyr, 'Active')
        cx += ASSIGN_COLS[5][1]
        row_action(f, cx + ASSIGN_COLS[6][1] - 10 - 26, cyr, 'pencil')
        f.line(tx, ry + row_h, tx + CONTENT_W - 28, ry + row_h, C['tdLine'])
        ry += row_h
    f.close()
    y += 16 + hdr_h + len(ASSIGNMENT_ROWS) * row_h

    annotate(f, CONTENT_X, y + 22,
             'Every assignment row is editable in both roles — assignments are company data, '
             'not standard library content. Deleting a computation is blocked while an '
             'assignment still references its code.')
    height = y + 22 + 50 + 28
    ch.shell_frame(f, height)
    return f, height


# ------------------------------------------------------------------ frame 03

GOVERNANCE = [
    ('Policy engine', 'The approved code and its configurable parameters'),
    ('Computational basis', 'The controlled formula'),
    ('Reference tables', 'Versioned statutory values the formula reads'),
    ('Payroll transaction', 'The employees, the trigger and the period'),
    ('Payroll result', 'The calculated, traceable outcome'),
]

CODE_ROWS = [
    ('THP-001', 'Minimum Take-Home Pay', 'Protects the configured minimum net pay after mandatory deductions.',
     'Take-Home Pay', 'Pay and Earnings', '6/14', 'Protected minimum and thresholds', True),
    ('THP-002', 'Maximum Controllable Deductions', 'Caps controllable deductions after statutory deductions are applied.',
     'Take-Home Pay', 'Pay and Earnings', '4/14', 'Deduction and loan caps', True),
    ('RET-001', 'Statutory Retirement Benefit', 'Calculates the statutory retirement benefit basis.',
     'Retirement Pay', 'Pay and Earnings', '5/12', 'Statutory basis and rounding', True),
    ('FIN-002', 'Separation Pay by Reason for Leaving', 'Maps each separation reason to its approved separation-pay computation, minimum, rounding and tax treatment.',
     'Final Pay', 'Pay and Earnings', '7/19', 'Separation reason matrix', True),
    ('GUP-001', 'Guaranteed Net Gross-Up', 'Iterates gross and withholding tax until the required net is reached.',
     'Gross Up', 'Pay and Earnings', '5/9', 'Iteration and tax method', True),
]

CODE_COLS = [('Code', 72), ('Policy code', 290), ('Applies to', 200), ('Governs', 96, 'middle'),
             ('Status', 92), ('Action', 174)]

# Each section is a list of grid rows; a row holds one or two fields, and a
# single-field row marked wide spans both columns (.policy-form-grid label.wide).
TAKE_HOME_SECTIONS = [
    ('Protected minimum', [
        [('Protected base', 'Gross pay less reimbursements', True),
         ('Threshold type', 'Percentage', True)],
        [('Threshold', '20 %', False)],
        [('Conflict priority', 'Take-Home Pay', True, 'wide')],
    ]),
    ('Deductions cap', [
        [('Deductions cap base', 'Gross pay', True),
         ('Deductions cap type', 'Percentage', True)],
        [('Deductions cap', '40 %', False)],
    ]),
    ('Loan cap', [
        [('Loan cap base', 'Gross pay', True), ('Loan cap type', 'Percentage', True)],
        [('Loan cap', '30 %', False)],
    ]),
    ('Lates, absences and undertime cap', [
        [('Attendance cap base', 'Basic pay', True),
         ('Attendance cap type', 'Number of Days', True)],
        [('Attendance cap', '5 days', False)],
    ]),
]

TOGGLES = [
    ('Auto-defer or stagger deductions', 'Trim lower-priority deductions when earnings are insufficient.', True),
    ('Carry forward to next payroll', 'Store outstanding amount, rescheduled date and new balance.', True),
    ('Payslip tagging', 'Show original, deducted, deferred and accumulated balances.', True),
    ('Admin and employee notification', 'Send an alert when a deduction is deferred or an exception remains.', True),
]

LEDGER = [
    ('Statutory deductions', 'Calculated · Rank 0 · Statutory', '2,500.00', '2,500.00', '0.00', '0.00', '0.00'),
    ('HMO', 'HMO · Rank 1 · Company-mandated', '1,200.00', '1,200.00', '0.00', '0.00', '0.00'),
    ('Salary Loan', 'LOA-002 · Rank 3 · Company-mandated', '3,000.00', '1,800.00', '1,200.00', '1,200.00', '1,200.00'),
    ('SSS Salary Loan', 'GLO-001 · Rank 4 · Government', '1,500.00', '0.00', '1,500.00', '1,500.00', '1,500.00'),
    ('Lates, Absences & Undertime', 'Calculated · Rank 8 · Attendance', '890.00', '890.00', '0.00', '0.00', '0.00'),
]


def _governance_flow(f, y):
    h_head = 53
    f.rect(CONTENT_X, y, CONTENT_W, h_head + 72, fill=C['white'], stroke=C['line'], rx=8)
    f.rect(CONTENT_X + 1, y + 1, CONTENT_W - 2, h_head - 1, fill=C['noticeBg'])
    f.line(CONTENT_X, y + h_head, CONTENT_X + CONTENT_W, y + h_head, C['line'])
    f.textc(CONTENT_X + 15, y + 20, 'How a payroll policy becomes a payroll result', 12, weight=600)
    f.textc(CONTENT_X + 15, y + 37,
            'Configurable values vary by company, employee group and employee. The formulas '
            'themselves stay controlled and versioned.', 7.5, fill=C['muted'])
    lw = (CONTENT_W - 30 - 4 * 6) / 5.0
    lx = CONTENT_X + 15
    for i, (label, detail) in enumerate(GOVERNANCE):
        ly = y + h_head + 12
        f.rect(lx, ly, lw, 48, fill=C['govBg'], stroke=C['line'], rx=5)
        f.circle(lx + 9 + 7.5, ly + 24, 7.5, fill=C['violet'])
        f.textc(lx + 16.5, ly + 24, str(i + 1), 7, fill=C['white'], weight=700, anchor='middle')
        tx = lx + 9 + 15 + 7
        f.textc(tx, ly + 15, label, 8, fill=C['violet'], weight=600)
        f.para(tx, ly + 26, detail, 6.5, fill=C['muted'], max_w=lw - 40, line_h=9.4)
        if i < 4:
            f.icon('caretRight', lx + lw - 9 - 11, ly + 18.5, 11, C['govArrow'], sw=2.6)
        lx += lw + 6
    return y + h_head + 72


def _code_library(f, y):
    hdr = 68
    summary = 51
    notice = 42
    toolbar = 60
    thead = 29
    row_h = 49
    total = hdr + summary + 10 + notice + toolbar + thead + row_h * len(CODE_ROWS)
    f.rect(CONTENT_X, y, CONTENT_W, total, fill=C['white'], stroke=C['codeLibLine'], rx=8)

    f.rect(CONTENT_X + 15, y + 16.5, 35, 35, fill=C['violetSoft'], rx=8)
    f.icon('table', CONTENT_X + 15 + 8.5, y + 16.5 + 8.5, 18, C['violet'])
    f.textc(CONTENT_X + 60, y + 27, 'Policy engine codes', 12, weight=600)
    f.textc(CONTENT_X + 60, y + 41,
            'Create reusable codes once, then assign them to Company Rules by sub-category.',
            8, fill=C['muted'])
    bl = 'Create policy code'
    bw = 30 + tw(bl, 11, 500) + 22
    button(f, CONTENT_X + CONTENT_W - 15 - bw, y + 34, bl, 'primary', icon='plus')
    f.line(CONTENT_X, y + hdr, CONTENT_X + CONTENT_W, y + hdr, C['codeLibHead'])

    sy = y + hdr
    f.rect(CONTENT_X + 1, sy, CONTENT_W - 2, summary, fill=C['codeSummaryBg'])
    cells = [('66', 'Available codes', C['violet']), ('12', 'Engine families', C['violet']),
             ('58', 'Mapped sub-categories', C['violet']), ('58/58', 'Template coverage', '#14845c')]
    cw = CONTENT_W / 4.0
    for i, (value, caption, ink) in enumerate(cells):
        cx = CONTENT_X + i * cw
        f.text(cx + 14, sy + 24, value, 13, fill=ink, weight=600)
        f.text(cx + 14, sy + 38, caption, 7, fill=C['muted'])
        if i < 3:
            f.line(cx + cw, sy, cx + cw, sy + summary, C['codeLibHead'])
    f.line(CONTENT_X, sy + summary, CONTENT_X + CONTENT_W, sy + summary, C['codeLibHead'])

    ny = sy + summary + 10
    f.rect(CONTENT_X + 12, ny, CONTENT_W - 24, notice, fill=C['coverBg'],
           stroke=C['coverLine'], rx=7)
    f.icon('checkCircle', CONTENT_X + 23, ny + 10, 14, C['coverInk'], sw=0)
    f.textc(CONTENT_X + 45, ny + 15,
            'Every Company Rules sub-category has a governed template.', 8.5,
            fill=C['coverInk'], weight=600)
    f.textc(CONTENT_X + 45, ny + 29,
            'Codes inherit the full approved parameter schema; arithmetic formulas and '
            'reference sources remain versioned in Computational Basis.', 7, fill='#5f5965')

    ty = ny + notice
    cy = ty + 30
    toolbar_search(f, CONTENT_X + 12, cy,
                   CONTENT_W - 24 - 9 - 150 - 9 - tw('66 codes', 7) - 4,
                   'Search code, sub-category, computation, or reference...')
    sx = CONTENT_X + CONTENT_W - 12 - tw('66 codes', 7) - 4 - 150
    compact_select(f, sx, cy, 'All categories')
    f.textc(CONTENT_X + CONTENT_W - 12 - tw('66 codes', 7), cy, '66 codes', 7, fill=C['muted'])

    tabx = CONTENT_X + 12
    tabw = CONTENT_W - 24
    hy = ty + toolbar
    scale = tabw / float(sum(c[1] for c in CODE_COLS))
    cols = [(c[0], c[1] * scale) + tuple(c[2:]) for c in CODE_COLS]
    table_header(f, tabx, hy, cols, font=8, pad_y=9)
    ry = hy + thead
    for code, name, desc, sub, cat, count, governs, built_in in CODE_ROWS:
        cx, cyr = tabx, ry + row_h / 2.0
        f.textc(cx + 10, cyr, code, 7.5, fill=C['violet'], weight=700, mono=True)
        cx += cols[0][1]
        f.textc(cx + 10, cyr - 10, name, 8, weight=600)
        f.para(cx + 10, cyr - 1, desc, 6.8, fill=C['muted'], max_w=cols[1][1] - 30,
               line_h=9.2, max_lines=2)
        cx += cols[1][1]
        f.textc(cx + 10, cyr - 6, sub, 8, weight=600)
        f.textc(cx + 10, cyr + 6, cat, 6.8, fill=C['muted'])
        cx += cols[2][1]
        f.rect(cx + cols[3][1] / 2.0 - 15, cyr - 15, 30, 30, fill=C['countBg'],
               stroke=C['countLine'], rx=8)
        f.textc(cx + cols[3][1] / 2.0, cyr, count, 10, fill=C['violet'], weight=700,
                anchor='middle')
        cx += cols[3][1]
        status_pill(f, cx + 10, cyr, 'Active')
        cx += cols[4][1]
        f.textc(cx + 10, cyr, 'Open engine', 7, fill=C['violet'], weight=700)
        lx = cx + 10 + tw('Open engine', 7, 700) + 7
        f.icon('lock', lx, cyr - 5.5, 11, C['muted'])
        f.textc(lx + 15, cyr, 'Standard', 7, fill=C['muted'])
        f.line(tabx, ry + row_h, tabx + tabw, ry + row_h, C['tdLine'])
        ry += row_h
    return y + total


def _policy_tabs(f, y):
    tabs = [('Take-Home Pay', 'THP-001', True), ('Retirement Pay', 'RET-001', False),
            ('Final Pay', 'FIN-001', False), ('Gross Up', 'GUP-001', False)]
    x = CONTENT_X
    for label, code, active in tabs:
        bw = 28 + tw(label, 9, 600) + 5 + tw(code, 7)
        f.rect(x, y + 3, bw, 36, fill=C['violet'] if active else C['white'],
               stroke=C['violet'] if active else '#bca0d5', rx=5)
        ink = C['white'] if active else C['violet']
        f.textc(x + 14, y + 21, label, 9, fill=ink, weight=600)
        f.textc(x + 14 + tw(label, 9, 600) + 5, y + 21.5, code, 7,
                fill='#d8c8ea' if active else '#95869e')
        x += bw + 7
    return y + 42


def _config_card(f, x, y, w):
    """.policy-config-card for the Take-Home Pay engine."""
    top = y
    f.textc(x + 15 + 46, y + 26, 'Minimum Take-Home Pay', 12, weight=600)
    f.textc(x + 15 + 46, y + 41,
            'Company policy controls; formula execution remains in Computational Basis.',
            7.5, fill=C['muted'])
    f.rect(x + 15, y + 15.5, 36, 36, fill=C['violetSoft'], rx=8)
    f.icon('shieldCheck', x + 15 + 7.5, y + 15.5 + 7.5, 21, C['violet'])
    switch(f, x + w - 15 - 34, y + 33.5, True)
    f.line(x, y + 67, x + w, y + 67, C['line'])
    y += 67

    # Applicability panel (collapsed to its summary — see the frame note).
    f.rect(x + 15, y + 12, w - 30, 76, fill=C['noticeBg'], stroke=C['noticeLine'], rx=6)
    f.textc(x + 26, y + 27, 'Applicability', 9, fill=C['violet'], weight=600, upper=True,
            spacing=0.45)
    labels = [('Scope', 'Employee group'), ('Employee group', 'All Employees'),
              ('Effective from', '2026-01-01')]
    cw = (w - 52) / 3.0
    for i, (lab, val) in enumerate(labels):
        cx = x + 26 + i * cw
        f.textc(cx, y + 46, lab, 7, fill=C['muted'], upper=True, spacing=0.3)
        f.textc(cx, y + 60, val, 8.5, fill=C['metaInk'], weight=600)
    f.textc(x + 26, y + 78, 'Take-Home Pay applies to all employees in every payroll run.',
            7, fill=C['noticeInk'])
    y += 12 + 76

    col_w = (w - 30 - 12) / 2.0
    for title, rows in TAKE_HOME_SECTIONS:
        f.textc(x + 15, y + 19, title, 9.5, fill=C['violet'], weight=500, upper=True,
                spacing=0.48)
        y += 26
        if title == 'Deductions cap':
            # The cap fields only render while its toggle is on.
            f.rect(x + 15, y, w - 30, 39, fill=C['white'], stroke=C['line'], rx=6)
            f.rect(x + 24, y + 12, 15, 15, fill=C['violet'], rx=3)
            f.icon('check', x + 26, y + 14, 11, C['white'], sw=2.6)
            f.textc(x + 47, y + 14, 'Apply a total deductions cap', 8, fill=C['label'],
                    weight=500)
            f.textc(x + 47, y + 27,
                    'Limit non-loan deductions collected in one payroll period.', 7,
                    fill=C['muted'])
            y += 39 + 10
        for row in rows:
            for i, spec in enumerate(row):
                lab, val, is_select = spec[0], spec[1], spec[2]
                wide = len(spec) > 3 and spec[3] == 'wide'
                fw = (w - 30) if wide else col_w
                field(f, x + 15 + i * (col_w + 12), y, fw, lab, val, height=34,
                      font=8.5, label_font=8, caret=is_select)
            y += 51 + 10
        y += 5

    f.rect(x + 15, y, w - 30, 39 * len(TOGGLES), fill=C['white'], stroke=C['line'], rx=6)
    for i, (lab, hint, on) in enumerate(TOGGLES):
        ty = y + i * 39
        if i:
            f.line(x + 15, ty, x + w - 15, ty, C['line'])
        f.rect(x + 24, ty + 12, 15, 15, fill=C['violet'] if on else C['white'],
               stroke=None if on else C['inputLine'], rx=3)
        if on:
            f.icon('check', x + 26, ty + 14, 11, C['white'], sw=2.6)
        f.textc(x + 47, ty + 14, lab, 8, fill=C['label'], weight=500)
        f.textc(x + 47, ty + 27, hint, 7, fill=C['muted'])
    y += 39 * len(TOGGLES) + 14

    f.rect(x + 15, y, w - 30, 96, fill=C['noticeBg'], stroke=C['noticeLine'], rx=6)
    f.textc(x + 26, y + 20, 'Deduction and loan hierarchy', 9, fill=C['violet'], weight=600)
    f.textc(x + 26, y + 34,
            'Sourced read-only from REF-011. Statutory items keep rank 0 and are never adjusted.',
            7, fill=C['noticeInk'])
    hx = x + 26
    for i, (label, rank) in enumerate([('Statutory', '0'), ('HMO', '1'), ('Educational', '2'),
                                       ('Salary Loan', '3'), ('SSS Loan', '4'), ('LAUT', '8')]):
        cwid = (w - 52 - 5 * 6) / 6.0
        f.rect(hx, y + 46, cwid, 34, fill=C['white'], stroke=C['line'], rx=5)
        f.textc(hx + 7, y + 57, label, 6.8, fill=C['metaInk'], weight=600)
        f.textc(hx + 7, y + 70, 'Rank ' + rank, 6.5, fill=C['muted'])
        hx += cwid + 6
    f.textc(x + 26, y + 90, 'Manage in Reference sources ›', 7, fill=C['violet'],
            weight=600)
    y += 96

    bl = 'Save take-home policy'
    bw = 30 + tw(bl, 11, 500)
    button(f, x + w - 15 - bw, y + 13 + 19, bl, 'primary')
    y += 13 + 38 + 13
    return y - top


def _simulator(f, x, y, w):
    top = y
    f.icon('calculator', x + 15, y + 19, 28, C['violet'])
    f.textc(x + 15 + 38, y + 26, 'Scenario simulator', 12, weight=600)
    f.textc(x + 15 + 38, y + 41, 'Run the BRD decision sequence before using it in payroll.',
            7.5, fill=C['muted'])
    f.line(x, y + 67, x + w, y + 67, C['line'])
    y += 67 + 14

    tests = [('Basic pay', '30,000.00'), ('Gross pay', '36,500.00'),
             ('Reimbursements / receivables', '1,500.00'),
             ('Mandatory statutory deductions', '2,500.00'), ('LAUT days', '2'),
             ('Current payroll date', '2026-08-15'), ('Next payroll date', '2026-08-31')]
    col_w = (w - 30 - 10) / 2.0
    for i, (lab, val) in enumerate(tests):
        cx = x + 15 + (i % 2) * (col_w + 10)
        field(f, cx, y, col_w, lab, val, height=34, font=8.5, label_font=8)
        if i % 2 == 1:
            y += 51 + 10
    y += 51 + 10

    f.rect(x + 15, y, w - 30, 44, fill=C['noticeBg'], stroke='#ded2e8', rx=5)
    f.icon('info', x + 25, y + 15, 14, C['violet'], sw=0)
    f.para(x + 47, y + 16, 'Gross pay 36,500.00 includes basic pay 30,000.00 and the rest of '
                           'the period earnings. The protected base is Gross pay less '
                           'reimbursements = 35,000.00, and the protected minimum is 7,000.00.',
           7.5, fill=C['noticeInk'], max_w=w - 72, line_h=11.25)
    y += 44 + 10

    results = [('Protected minimum', '7,000.00', False), ('Final take-home', '30,110.00', False),
               ('Deferred this cutoff', '2,700.00', False), ('Mandatory deducted', '2,500.00', False)]
    rw = (w - 30 - 7) / 2.0
    for i, (lab, val, hl) in enumerate(results):
        cx = x + 15 + (i % 2) * (rw + 7)
        ry = y + (i // 2) * (54 + 7)
        f.rect(cx, ry, rw, 54, fill=C['violet'] if hl else C['policyResBg'], rx=6)
        f.textc(cx + 10, ry + 16, lab, 6.5, fill=C['white'] if hl else C['muted'])
        f.textc(cx + 10, ry + 34, val, 12, fill=C['white'] if hl else C['policyResInk'],
                weight=600)
    y += 54 * 2 + 7 + 13

    f.rect(x + 15, y, w - 30, 61, fill=C['okBg'], rx=6)
    f.icon('checkCircle', x + 27, y + 20, 21, C['okInk'], sw=0)
    f.textc(x + 57, y + 22, 'Protected minimum satisfied', 8.5, fill=C['okInk'], weight=600)
    f.para(x + 57, y + 37, 'Statutory deductions stayed intact and the hierarchy stopped once '
                           'the threshold was met.', 7, fill=C['okInk'], max_w=w - 90,
           line_h=10.15)
    y += 61 + 12

    f.textc(x + 15, y + 8, 'Deduction ledger', 9.5, weight=600)
    y += 20
    lcols = [('Item', 0.34), ('Due', 0.13), ('Deducted', 0.14), ('Deferred', 0.13),
             ('Accumulated', 0.14), ('Remaining', 0.12)]
    inner = w - 30
    f.rect(x + 15, y, inner, 25 + 34 * len(LEDGER), fill=C['white'], stroke=C['line'], rx=5)
    cx = x + 15
    for label, frac in lcols:
        f.textc(cx + 7, y + 12.5, label, 7, weight=600)
        cx += inner * frac
    f.line(x + 15, y + 25, x + 15 + inner, y + 25, C['thLine'])
    ry = y + 25
    for row in LEDGER:
        cx = x + 15
        f.textc(cx + 7, ry + 12, row[0], 7, weight=600)
        f.textc(cx + 7, ry + 23, row[1], 6, fill=C['muted'])
        cx += inner * lcols[0][1]
        for i, val in enumerate(row[2:]):
            f.textc(cx + 7, ry + 17, val, 7)
            cx += inner * lcols[i + 1][1]
        if ry > y + 25:
            f.line(x + 15, ry, x + 15 + inner, ry, C['tdLine'])
        ry += 34
    y += 25 + 34 * len(LEDGER) + 12
    return y - top


def frame_policy_engines():
    f = Frame('03 Policy engines')
    y = ch.shell_content(f, 'Policy engines')
    y += 14

    f.open('Governance flow')
    y = _governance_flow(f, y) + 13
    f.close()

    f.open('Policy engine codes')
    y = _code_library(f, y) + 14
    f.close()

    f.open('Engine tabs')
    y = _policy_tabs(f, y)
    f.close()

    left_w = (CONTENT_W - 13) * 1.22 / 2.10
    right_w = CONTENT_W - 13 - left_w
    right_x = CONTENT_X + left_w + 13

    # The card border has to sit behind its content, but its height is only known
    # after the content is laid out — so reserve a slot and backfill it.
    f.open('Take-Home Pay configuration')
    slot = len(f.parts)
    f.parts.append('')
    left_h = _config_card(f, CONTENT_X, y, left_w)
    f.parts[slot] = _card_markup(CONTENT_X, y, left_w, left_h)
    f.close()

    f.open('Scenario simulator')
    slot = len(f.parts)
    f.parts.append('')
    right_h = _simulator(f, right_x, y, right_w)
    f.parts[slot] = _card_markup(right_x, y, right_w, right_h)
    f.close()
    y += max(left_h, right_h)

    annotate(f, CONTENT_X, y + 22,
             'The Applicability and Deduction-hierarchy panels are shown as their summary '
             'state; both expand into full sub-forms in the prototype (scope + employee '
             'group + effective dates, and the nine-row REF-011 ordering with per-item '
             'scenario amounts). The Deferred-recovery panel appears below the ledger only '
             'while Carry forward is on.', width=680)
    height = y + 22 + 74 + 28
    ch.shell_frame(f, height)
    return f, height


# ------------------------------------------------------------------ frame 04

REFERENCES = [
    ('REF-001', 'BIR Withholding Tax Table 2026', 'Tax', 3, '2026.1', '2026-01-01', True, False),
    ('REF-002', 'SSS Contribution Table 2026', 'Linked Statutory', 3, '2026.1', '2026-01-01', True, True),
    ('REF-003', 'PhilHealth Contribution Table 2026', 'Linked Statutory', 3, '2026.1', '2026-01-01', True, True),
    ('REF-004', 'HDMF Contribution Table 2026', 'Linked Statutory', 3, '2026.1', '2026-01-01', True, True),
    ('REF-005', 'Minimum Wage Table', 'Payroll', 2, '1.0', '2025-01-01', True, False),
    ('REF-006', 'De Minimis Ceiling', 'Tax', 2, '1.0', '2025-01-01', True, False),
    ('REF-007', 'Bonus Tax Exemption Ceiling', 'Tax', 2, '1.0', '2025-01-01', True, False),
    ('REF-008', 'Overtime Premium Rates', 'Earnings', 3, '1.0', '2025-01-01', True, False),
    ('REF-009', 'Holiday Premium Rates', 'Earnings', 3, '1.0', '2025-01-01', True, False),
    ('REF-010', 'Factor Days', 'Basic Pay', 2, '1.0', '2025-01-01', True, False),
    ('REF-011', 'Deduction and Loan Hierarchy', 'Deductions', 9, '1.0', '2025-01-01', True, False),
    ('REF-012', 'Minimum Take Home Pay', 'Deductions', 2, '1.0', '2025-01-01', True, False),
]


def frame_references():
    f = Frame('04 Reference sources')
    y = ch.shell_content(f, 'Reference sources')

    f.open('Toolbar')
    cy = y + 32.5
    ch.workspace_copy(f, CONTENT_X, cy - 6, 'Formula reference sources',
                      'Maintain formula reference sources. Statutory contribution versions '
                      'are linked here but managed in Settings, then consumed read-only in '
                      'Payroll.')
    bw = 30 + tw('Download report', 11, 500) + 22 + 19
    button(f, CONTENT_X + CONTENT_W - bw, cy, 'Download report', 'secondary',
           icon='download', caret=True)
    f.close()
    y += 65

    f.open('Reference cards')
    cw = (CONTENT_W - 2 * 12) / 3.0
    for i, (code, name, cat, rows, ver, eff, enabled, linked) in enumerate(REFERENCES):
        x = CONTENT_X + (i % 3) * (cw + 12)
        cy0 = y + (i // 3) * (215 + 12)
        f.rect(x, cy0, cw, 215, fill=C['white'], stroke=C['refCardLine'], rx=8)
        f.rect(x + 16, cy0 + 16, 34, 34, fill=C['violetSoft'], rx=8)
        f.icon('table', x + 16 + 8, cy0 + 16 + 8, 18, C['violet'])
        switch(f, x + cw - 16 - 34, cy0 + 16 + 17, enabled)

        f.textc(x + 16, cy0 + 67, '%s · %s' % (code, cat), 7.5, fill=C['refCode'])
        f.para(x + 16, cy0 + 87, name, 11, fill=C['refName'], weight=600, max_w=cw - 32,
               line_h=14.85)
        f.textc(x + 16, cy0 + 107, '%s configured rows' % rows, 8, fill=C['muted'])

        dw = (cw - 32 - 2 * 5) / 3.0
        for j, (dt, dd) in enumerate([('Version', ver), ('Effective', eff),
                                      ('Company', 'Enabled' if enabled else 'Disabled')]):
            dx = x + 16 + j * (dw + 5)
            f.rect(dx, cy0 + 122, dw, 36, fill=C['refDlBg'], rx=5)
            f.textc(dx + 7, cy0 + 133, dt, 7, fill=C['refDt'])
            f.textc(dx + 7, cy0 + 147, dd, 8,
                    fill=C['activeInk'] if enabled else '#8a5656', weight=600)

        f.line(x + 16, cy0 + 215 - 16 - 23, x + cw - 16, cy0 + 215 - 16 - 23, C['line'])
        fy = cy0 + 215 - 16 - 6
        if linked:
            f.icon('table', x + 16, fy - 6.5, 13, C['violet'])
            f.textc(x + 16 + 18, fy, 'Manage in Settings', 8, fill=C['violet'])
        else:
            f.icon('pencil', x + 16, fy - 6.5, 13, C['violet'])
            f.textc(x + 16 + 18, fy, 'Manage', 8, fill=C['violet'])
            ux = x + cw - 16 - 13 - 5 - tw('Upload version', 8)
            f.icon('upload', ux, fy - 6.5, 13, C['violet'])
            f.textc(ux + 18, fy, 'Upload version', 8, fill=C['violet'])
    f.close()
    y += 4 * 215 + 3 * 12

    annotate(f, CONTENT_X, y + 25,
             'Twelve of thirty sources shown; the real grid lists all REF-001…REF-030 and '
             'wraps to two columns below 1080px. Linked Statutory cards route to Settings '
             'instead of exposing Manage / Upload version, and the company switch writes a '
             'Change history entry either way.')
    height = y + 25 + 62 + 28
    ch.shell_frame(f, height)
    return f, height


# ------------------------------------------------------------------ frame 05

HISTORY = [
    ('BIR Withholding Tax Table 2026', 'Reference table', 'Version uploaded', '2026.1',
     'P&A Admin', 'Aug 8, 2026 · 3:42 PM'),
    ('Minimum Take Home Pay', 'Computation', 'Formula updated', '1.1', 'Client Admin',
     'Aug 8, 2026 · 2:17 PM'),
    ('SSS Employee Contribution', 'Computation', 'Test calculation passed', '1.0',
     'P&A Admin', 'Aug 7, 2026 · 11:05 AM'),
    ('Locations', 'Reference table', 'Disabled for company', '1.0', 'Client Admin',
     'Aug 6, 2026 · 4:20 PM'),
]


def frame_history():
    f = Frame('05 Change history')
    y = ch.shell_content(f, 'Change history')

    f.open('Toolbar')
    cy = y + 32.5
    ch.workspace_copy(f, CONTENT_X, cy - 6, 'Change history',
                      'Review formula edits, table versions, tests, and client enablement '
                      'changes.')
    bw = 30 + tw('Download report', 11, 500) + 22 + 19
    button(f, CONTENT_X + CONTENT_W - bw, cy, 'Download report', 'secondary',
           icon='download', caret=True)
    f.close()
    y += 65

    f.open('History list')
    f.rect(CONTENT_X, y, CONTENT_W, 76 * len(HISTORY), fill=C['white'], stroke=C['line'], rx=8)
    for i, (item, kind, action, ver, user, when) in enumerate(HISTORY):
        ay = y + i * 76
        if i:
            f.line(CONTENT_X, ay, CONTENT_X + CONTENT_W, ay, C['line'])
        f.rect(CONTENT_X + 18, ay + 13, 32, 32, fill=C['violetSoft'], rx=8)
        f.icon('clockCounter', CONTENT_X + 18 + 8, ay + 13 + 8, 16, C['violet'])
        tx = CONTENT_X + 18 + 32 + 12
        f.textc(tx, ay + 22, item, 10, weight=600)
        chip(f, tx + tw(item, 10, 600) + 7, ay + 22, kind, font=7, height=14, radius=8, pad=6)
        f.textc(tx, ay + 40, action, 9, fill=C['histInk'])
        f.textc(tx, ay + 56, '%s · %s · Version %s' % (when, user, ver), 7.5,
                fill=C['histSmall'])
    f.close()
    y += 76 * len(HISTORY)

    annotate(f, CONTENT_X, y + 22,
             'Newest first, prepended in place — no pagination. Every formula save, bulk CSV '
             'import, reference version upload, company enable/disable and passing test '
             'calculation writes one row here.')
    height = y + 22 + 50 + 28
    ch.shell_frame(f, height)
    return f, height


# ------------------------------------------- frames 06–08: the formula editor

EDITOR_TABS = ['Formula setup', 'Test calculation', 'Change details']
MODAL_W = 930
MODAL_X = (W - MODAL_W) / 2.0
MAPPED = [('hourly_rate', 'Hourly rate', '172.41'),
          ('ot_hours', 'Overtime hours', '6'),
          ('ot_rate', 'Overtime multiplier', '1.25')]


def _editor_tabs(f, x, y, active):
    f.line(x, y + 43, x + MODAL_W, y + 43, C['line'])
    tx = x + 20
    for label in EDITOR_TABS:
        is_active = label == active
        ink = C['violet'] if is_active else '#746e79'
        f.textc(tx, y + 43 - 21, label, 9.5, fill=ink, weight=600 if is_active else 400)
        lw = tw(label, 9.5, 600 if is_active else 400)
        if is_active:
            f.rect(tx, y + 41, lw, 2, fill=C['violet'])
        tx += lw + 18
    return y + 43


def frame_editor_formula():
    body_h = 17 + 213 + 17 + 337.5 + 20
    modal_h = 58 + 43 + body_h + 64
    height = int(modal_h + 120)
    f = Frame('06 Formula editor · Formula setup')
    backdrop(f, height)
    my = (height - modal_h) / 2.0

    f.open('Formula editor')
    y = modal_shell(f, MODAL_X, my, MODAL_W, modal_h, 'Edit computation · ERN-002')
    y = _editor_tabs(f, MODAL_X, y, 'Formula setup')
    y += 17
    ix = MODAL_X + 20
    iw = MODAL_W - 40
    col = (iw - 14) / 2.0

    f.open('Computation details')
    field(f, ix, y, col, 'Computation code', 'ERN-002', readonly=True)
    field(f, ix + col + 14, y, col, 'Computation name', 'Overtime Pay')
    field(f, ix, y + 68, col, 'Category', 'Earnings', caret=True)
    field(f, ix + col + 14, y + 68, col, 'Status', 'Active', caret=True)
    f.text(ix, y + 136 + 10, 'Description', 9.5, fill=C['label'], weight=500)
    textarea(f, ix, y + 136 + 17.8, iw, 60,
             'Computes overtime pay using the applicable premium multiplier.')
    f.close()
    y += 213 + 17

    f.open('Expression builder')
    bh = 337.5
    f.rect(ix, y, iw, bh, fill=C['builderBg'], stroke=C['builderLine'], rx=7)
    bx = ix + 15
    bw = iw - 30
    f.textc(bx, y + 22, 'Expression builder', 12, weight=600)
    f.para(bx, y + 40, 'Build a company calculation from approved payroll fields and '
                       'operators. Atlas validates the expression before it can be saved.',
           8.5, fill=C['muted'], max_w=bw - 120, line_h=12.3)
    cl = 'Version 1.0'
    cwid = 16 + tw(cl, 8)
    f.rect(ix + iw - 15 - cwid, y + 15, cwid, 22, fill=C['violetSoft'], rx=11)
    f.textc(ix + iw - 15 - cwid + 8, y + 26, cl, 8, fill=C['violet'])

    ey = y + 57.5
    f.rect(bx, ey, bw, 78, fill=C['white'], stroke=C['exprLine'], rx=4)
    f.textc(bx + 10, ey + 18, '{{hourly_rate}} * {{ot_hours}} * {{ot_rate}}', 10,
            fill=C['exprInk'], mono=True)

    ry = ey + 78 + 9
    sel_w = (bw - 16) * 0.34
    input_box(f, bx, ry, sel_w, 'Hourly rate', height=34, font=9, caret=True)
    ins_w = 30 + tw('Insert field', 11, 500) + 22
    button(f, bx + sel_w + 8, ry + 17, 'Insert field', 'secondary', icon='plus', height=34)
    ops = ['+', '−', '×', '÷', '(', ')', 'MIN(', 'MAX(']
    ox = bx + bw
    for op in reversed(ops):
        ow = max(29, 12 + tw(op, 9))
        ox -= ow
        f.rect(ox, ry + 2, ow, 30, fill=C['white'], stroke=C['opLine'], rx=4)
        f.textc(ox + ow / 2.0, ry + 17, op, 9, fill=C['violet'], anchor='middle')
        ox -= 4

    my2 = ry + 34 + 12
    f.rect(bx, my2, bw, 33 * (len(MAPPED) + 1), fill=C['white'], stroke=C['line'], rx=5)
    mcols = [('Mapped field', bw * 0.32), ('Atlas source', bw * 0.42), ('Sample value', bw * 0.26)]
    cx = bx
    for label, cwd in mcols:
        f.textc(cx + 9, my2 + 16.5, label, 8.5, weight=600)
        cx += cwd
    f.line(bx, my2 + 33, bx + bw, my2 + 33, C['thLine'])
    for i, (code, label, sample) in enumerate(MAPPED):
        ly = my2 + 33 * (i + 1)
        f.textc(bx + 9, ly + 16.5, '{{%s}}' % code, 8.5, fill=C['violet'], mono=True)
        f.textc(bx + mcols[0][1] + 9, ly + 16.5, label, 8.5)
        f.textc(bx + mcols[0][1] + mcols[1][1] + 9, ly + 16.5, sample, 8.5)
        if i:
            f.line(bx, ly, bx + bw, ly, C['tdLine'])
    f.close()

    sticky_actions(f, MODAL_X, my + 58 + 43 + body_h, MODAL_W,
                   [('Cancel', 'secondary', None), ('Validate and save', 'primary', None)])
    f.close()
    return f, height


def frame_editor_test():
    body_h = 17 + 61.5 + 17 + 125 + 18 + 47 + 20
    modal_h = 58 + 43 + body_h + 64
    height = int(modal_h + 220)
    f = Frame('07 Formula editor · Test calculation')
    backdrop(f, height)
    my = (height - modal_h) / 2.0

    f.open('Formula editor')
    y = modal_shell(f, MODAL_X, my, MODAL_W, modal_h, 'Edit computation · ERN-002')
    y = _editor_tabs(f, MODAL_X, y, 'Test calculation')
    y += 17
    ix, iw = MODAL_X + 20, MODAL_W - 40

    f.rect(ix, y, iw, 61.5, fill=C['violetSoft'], rx=7)
    f.icon('flask', ix + 15, y + 15.75, 30, C['violet'])
    f.textc(ix + 15 + 41, y + 24, 'Test calculation', 12, fill=C['violet'], weight=600)
    f.textc(ix + 15 + 41, y + 41,
            'Run the draft formula with controlled values before saving it.', 8.5,
            fill=C['violet'])
    y += 61.5 + 17

    col = (iw - 14) / 2.0
    for i, (code, label, sample) in enumerate(MAPPED):
        cx = ix + (i % 2) * (col + 14)
        field(f, cx, y + (i // 2) * 68, col, label, sample)
    y += 125 + 18

    button(f, ix, y + 19, 'Run test', 'primary', icon='flask')
    rw = 26 + 18 + 9 + tw('₱ 1,293.08', 13, 600)
    rx = ix + 30 + tw('Run test', 11, 500) + 22 + 14
    f.rect(rx, y, rw, 47, fill=C['testBg'], rx=6)
    f.icon('check', rx + 13, y + 14.5, 18, C['testInk'], sw=2.6)
    f.textc(rx + 13 + 27, y + 16, 'Formula passed', 7.5, fill=C['testInk'])
    f.textc(rx + 13 + 27, y + 32, '₱ 1,293.08', 13, fill=C['testInk'], weight=600)

    sticky_actions(f, MODAL_X, my + 58 + 43 + body_h, MODAL_W,
                   [('Cancel', 'secondary', None), ('Validate and save', 'primary', None)])
    f.close()
    annotate(f, MODAL_X, my + modal_h + 24,
             'Only the fields the expression actually references get a test input, so the '
             'grid grows and shrinks with the formula. A failing run replaces this green '
             'result with the .basis-error band and forces the Formula setup tab.',
             width=MODAL_W)
    return f, height


def frame_editor_change():
    body_h = 17 + 42.5 + 13 + 57 + 13 + 89 + 16 + 56 + 20
    modal_h = 58 + 43 + body_h + 64
    height = int(modal_h + 220)
    f = Frame('08 Formula editor · Change details')
    backdrop(f, height)
    my = (height - modal_h) / 2.0

    f.open('Formula editor')
    y = modal_shell(f, MODAL_X, my, MODAL_W, modal_h, 'Edit computation · ERN-002')
    y = _editor_tabs(f, MODAL_X, y, 'Change details')
    y += 17
    ix = MODAL_X + 20
    iw = 650

    f.textc(ix, y + 8, 'Change details', 12, weight=600)
    f.para(ix, y + 27, 'Saving creates a new controlled version and records the change in '
                       'history.', 8.5, fill=C['muted'], max_w=iw, line_h=12.3)
    y += 42.5 + 13
    field(f, ix, y, 260, 'Effective date', '2026-08-17', caret=True)
    y += 57 + 13
    f.text(ix, y + 10, 'Change note', 9.5, fill=C['label'], weight=500)
    textarea(f, ix, y + 17.8, iw, 72,
             'Updated through the Computational Basis workspace.')
    y += 89 + 16

    cells = [('Current version', '1.0'), ('Next version', '1.1'), ('Changed by', 'Client Admin')]
    sw = (iw - 20) / 3.0
    for i, (lab, val) in enumerate(cells):
        cx = ix + i * (sw + 10)
        f.rect(cx, y, sw, 56, fill=C['white'], stroke=C['line'], rx=6)
        f.textc(cx + 10, y + 20, lab, 8, fill=C['muted'])
        f.textc(cx + 10, y + 38, val, 10, fill='#3f3746', weight=600)

    sticky_actions(f, MODAL_X, my + 58 + 43 + body_h, MODAL_W,
                   [('Cancel', 'secondary', None), ('Validate and save', 'primary', None)])
    f.close()
    annotate(f, MODAL_X, my + modal_h + 24,
             'Version numbers are derived, never typed: saving an existing computation bumps '
             '1.0 to 1.1, and creating one starts at 1.0 with Ownership "Company". Creating '
             'swaps these three cells to Initial version / Ownership / Created by.',
             width=MODAL_W)
    return f, height


# ------------------------------------------------------ frame 09: view drawer

DRAWER_W = 520


def frame_drawer():
    height = 900
    f = Frame('09 Computation detail drawer')
    backdrop(f, height)
    x = W - DRAWER_W

    f.open('Computation drawer')
    f.rect(x, 0, DRAWER_W, height, fill=C['white'])
    f.textc(x + 20, 30, 'ERN-002 · Version 1.0', 9, fill=C['muted'])
    f.textc(x + 20, 48, 'Overtime Pay', 17, weight=500)
    f.icon('x', x + DRAWER_W - 20 - 30.5, 39 - 10.5, 21, C['ink'])
    f.line(x, 78, W, 78, C['line'])

    y = 78 + 18
    bx = x + 20
    bw = DRAWER_W - 40

    f.open('Summary')
    details = [('Category', 'Earnings'), ('Source', 'Built-in standard'),
               ('Status', 'Active'), ('Effective date', '2026-01-01'),
               ('Updated by', 'System Standard')]
    cwid = (bw - 18) / 2.0
    for i, (label, value) in enumerate(details):
        cx = bx + (i % 2) * (cwid + 18)
        cy = y + (i // 2) * (30.3 + 16)
        f.textc(cx, cy + 6, label, 9.5, weight=600)
        if label == 'Source':
            source_chip(f, cx, cy + 24, True)
        elif label == 'Status':
            status_pill(f, cx, cy + 24, 'Active')
        else:
            f.textc(cx, cy + 24, value, 10, fill='#615d65')
    y += 122.9 + 18
    f.line(bx, y, bx + bw, y, C['line'])
    y += 18
    f.close()

    f.textc(bx, y + 6, 'Description', 12, weight=600)
    f.para(bx, y + 29, 'Computes overtime pay using the applicable premium multiplier.',
           9.5, fill='#615d65', max_w=bw, line_h=15.2)
    y += 59.6 + 18
    f.line(bx, y, bx + bw, y, C['line'])
    y += 18

    f.textc(bx, y + 6, 'Formula expression', 12, weight=600)
    f.rect(bx, y + 29, bw, 40, fill=C['noticeBg'], stroke='#ded3e8', rx=5)
    f.textc(bx + 13, y + 49, '{{hourly_rate}} * {{ot_hours}} * {{ot_rate}}', 9,
            fill=C['violet'], mono=True)
    y += 69.2 + 18
    f.line(bx, y, bx + bw, y, C['line'])
    y += 18

    f.textc(bx, y + 6, 'Mapped fields', 12, weight=600)
    chx = bx
    for _, label, _s in MAPPED:
        chx += chip(f, chx, y + 40, label, font=8) + 6
    y += 51.2 + 18
    f.line(bx, y, bx + bw, y, C['line'])
    y += 18

    f.textc(bx, y + 6, 'Standard test result', 12, weight=600)
    f.rect(bx, y + 29, bw, 54, fill='#ecf9f2', rx=6)
    f.icon('check', bx + 12, y + 29 + 17, 20, '#157a4d', sw=2.6)
    f.textc(bx + 44, y + 29 + 18, 'Passed using sample values', 8, fill='#157a4d')
    f.textc(bx + 44, y + 29 + 36, '₱ 1,293.08', 13, fill='#157a4d', weight=600)

    fy = height - 66
    f.line(x, fy, W, fy, C['line'])
    f.icon('lock', bx, fy + 33 - 8.5, 17, C['violet'])
    f.para(bx + 24, fy + 30, 'Built-in formula — edit in Settings › Standard '
                             'Computation Library', 9.5, fill='#6f6976', max_w=250,
           line_h=13.3)
    bwid = 30 + tw('Close', 11, 500)
    button(f, x + DRAWER_W - 20 - bwid, fy + 33, 'Close', 'secondary')
    f.close()

    annotate(f, 60, 60,
             'Read-only inspector, opened by the row eye action. For an admin-defined '
             'computation (or any row in the P&A Admin role) the footer lock note is '
             'replaced by a primary "Edit computation" button that hands the record to the '
             'formula editor.', width=420)
    return f, height


# ------------------------------------------------- frame 10: assignment modal

def frame_assignment_modal():
    mw = 700
    mx = (W - mw) / 2.0
    body_h = 18 + 57 + 11 + 57 + 11 + 57 + 11 + 57 + 18
    modal_h = 58 + body_h + 64
    height = int(modal_h + 260)
    f = Frame('10 Add computation assignment')
    backdrop(f, height)
    my = (height - modal_h) / 2.0

    f.open('Assignment modal')
    y = modal_shell(f, mx, my, mw, modal_h, 'Add computation assignment') + 18
    ix, iw = mx + 20, mw - 40
    col = (iw - 14) / 2.0
    field(f, ix, y, col, 'Assignment type', 'Government deduction', caret=True)
    field(f, ix + col + 14, y, col, 'Reference table', 'SSS Contribution Table 2026',
          caret=True)
    y += 68
    field(f, ix, y, iw, 'Basis of computation', 'GOV-001 · SSS Employee Contribution',
          caret=True)
    y += 68
    field(f, ix, y, col, 'Employee group', 'All Employees', caret=True)
    field(f, ix + col + 14, y, col, 'Frequency', 'Every payroll', caret=True)
    y += 68
    field(f, ix, y, col, 'Status', 'Active', caret=True)
    sticky_actions(f, mx, my + 58 + body_h, mw,
                   [('Cancel', 'secondary', None), ('Save assignment', 'primary', None)])
    f.close()

    annotate(f, mx, my + modal_h + 24,
             'Reference table lists only sources currently enabled for the company, and '
             'Basis of computation lists only Active computations — a disabled source or an '
             'inactive formula cannot be assigned. Editing reuses this form with the row\'s '
             'values and the title "Edit computation assignment".', width=mw)
    return f, height


# -------------------------------------------------- frame 11: reference table

HIERARCHY = [
    ('Statutory deductions', '0', 'Statutory · Never adjusted'),
    ('HMO', '1', 'Loan · Company-mandated'),
    ('Educational Loan', '2', 'Loan · Company-mandated'),
    ('Salary Loan', '3', 'Loan · Company-mandated'),
    ('SSS Salary Loan', '4', 'Loan · Government'),
    ('HDMF Salary Loan', '5', 'Loan · Government'),
    ('SSS Calamity Loan', '6', 'Loan · Government'),
    ('Optional deductions', '7', 'Deduction · Optional'),
    ('Lates, Absences & Undertime', '8', 'Deduction · Attendance'),
]


def frame_reference_modal():
    mw = 980
    mx = (W - mw) / 2.0
    table_h = 27 + 44 * len(HIERARCHY)
    body_h = 16 + 48 + 12 + 44 + 10 + table_h + 16
    modal_h = 58 + body_h + 64
    height = int(modal_h + 200)
    f = Frame('11 Manage reference table')
    backdrop(f, height)
    my = (height - modal_h) / 2.0

    f.open('Reference table modal')
    y = modal_shell(f, mx, my, mw, modal_h,
                    'Manage reference table · Deduction and Loan Hierarchy') + 16
    ix, iw = mx + 20, mw - 40

    mwid = (iw - 34 - 27) / 3.0
    for i, (lab, val) in enumerate([('Code', 'REF-011'), ('Version', '1.0'),
                                    ('Effective', '2025-01-01')]):
        cx = ix + i * (mwid + 9)
        f.rect(cx, y, mwid, 48, fill=C['metaBg'], rx=5)
        f.textc(cx + 10, y + 17, lab, 7, fill=C['muted'])
        f.textc(cx + 10, y + 33, val, 9, fill=C['metaInk'], weight=600)
    switch(f, ix + iw - 34, y + 24, True)
    y += 48 + 12

    f.rect(ix, y, iw, 44, fill=C['noticeBg'], stroke=C['linkedLine'], rx=6)
    f.icon('lock', ix + 12, y + 14, 16, C['violet'])
    f.para(ix + 36, y + 17, 'Item codes and classifications come from the active Deduction '
                            'and Loan modules. Only the adjustment rank is maintained here.',
           8, fill=C['noticeInk'], max_w=iw - 60, line_h=12)
    y += 44 + 10

    cols = [('Key / Range', 330), ('Adjustment rank', 200), ('Notes / source', 330),
            ('Action', 78)]
    f.rect(ix, y, iw, table_h, fill=C['white'], stroke=C['line'], rx=6)
    cx = ix
    for label, cwd in cols:
        f.textc(cx + 6, y + 13.5, label, 10.5, weight=600)
        cx += cwd
    f.line(ix, y + 27, ix + iw, y + 27, C['thLine'])
    ry = y + 27
    for key, rank, note in HIERARCHY:
        cx = ix
        statutory = 'Statutory' in key
        input_box(f, cx + 6, ry + 6, cols[0][1] - 12, key, height=32, font=8.5, readonly=True)
        cx += cols[0][1]
        input_box(f, cx + 6, ry + 6, cols[1][1] - 12, rank, height=32, font=8.5,
                  readonly=True)
        cx += cols[1][1]
        input_box(f, cx + 6, ry + 6, cols[2][1] - 12, note, height=32, font=8.5,
                  readonly=True)
        cx += cols[2][1]
        f.icon('lock', cx + 6, ry + 15, 15, C['muted'])
        f.line(ix, ry + 44, ix + iw, ry + 44, C['tdLine'])
        ry += 44

    ay = my + 58 + body_h
    f.line(mx, ay, mx + mw, ay, C['line'])
    f.rect(mx, ay + 1, mw, 63, fill=C['white'])
    button(f, mx + 20, ay + 32, 'Download CSV', 'secondary', icon='download')
    bwid = 30 + tw('Close', 11, 500)
    button(f, mx + mw - 20 - bwid, ay + 32, 'Close', 'secondary')
    f.close()

    annotate(f, mx, my + modal_h + 24,
             'REF-011 is the locked variant: keys, notes and the statutory rank are '
             'read-only because they are generated from the Deduction and Loan modules, so '
             'Save table is withheld and only Download CSV / Close remain. An ordinary '
             'source shows editable inputs, a Remove action per row, an "Add" row at the '
             'bottom and a primary Save table button.', width=mw)
    return f, height


# ---------------------------------------------------- frame 12: delete dialog

def frame_delete_modal():
    mw = 480
    mx = (W - mw) / 2.0
    body_h = 18 + 44.8 + 8 + 36 + 18
    modal_h = 58 + body_h + 58
    height = int(modal_h + 300)
    f = Frame('12 Delete company computation')
    backdrop(f, height)
    my = (height - modal_h) / 2.0

    f.open('Delete dialog')
    y = modal_shell(f, mx, my, mw, modal_h, 'Delete company computation') + 18
    ix, iw = mx + 20, mw - 40
    f.para(ix, y + 12, 'Delete CUS-001 · Night Shift Allowance from this company’s '
                       'computation library?', 16, max_w=iw, line_h=22.4)
    y += 44.8 + 8
    f.para(ix, y + 10, 'It will no longer be available for new assignments. Atlas standard '
                       'computations are not affected.', 13, fill=C['ink'], max_w=iw,
           line_h=18)

    cy = my + 58 + body_h + 20 + 19
    bwid = 30 + tw('Delete computation', 11, 500) + 22
    button(f, mx + mw - bwid, cy, 'Delete computation', 'danger', icon='trash')
    cwid = 30 + tw('Cancel', 11, 500)
    button(f, mx + mw - bwid - 9 - cwid, cy, 'Cancel', 'secondary')
    f.close()

    annotate(f, mx - 120, my + modal_h + 30,
             'Reachable only for admin-defined computations, and only when no assignment '
             'still references the code — otherwise the row action raises an error toast '
             'instead of opening this dialog. Two measurement notes carried over from '
             'styles.css: this body copy inherits the 16px browser default (every other '
             'basis surface sets its own size), and .modal-actions here has no horizontal '
             'padding, so the buttons sit flush against the modal border.', width=720)
    return f, height


# ------------------------------------------------------ frame 13: style sheet

def frame_style_sheet():
    height = 1080
    f = Frame('13 Style sheet', bg=C['shellBg'])
    f.rect(0, 0, W, height, fill=C['shellBg'])
    f.text(60, 74, 'Computational Basis — tokens and components', 28, fill=C['violet'],
           weight=600, spacing=-0.8)
    f.text(60, 96, 'Measured from company-configuration-prototype/src/styles.css', 11,
           fill=C['muted'])

    def panel(x, y, w, h, title):
        f.rect(x, y, w, h, fill=C['white'], stroke=C['line'], rx=8)
        f.textc(x + 20, y + 26, title, 13, weight=600)
        return y + 48

    # colours
    py = panel(60, 130, 740, 250, 'Colour')
    swatches = [('violet', '#54248f', '--violet'), ('violet2', '#7c3fc2', '--violet-2'),
                ('violetSoft', '#f2ebfa', '--violet-soft'), ('canvas', '#f7f8fb', '--canvas'),
                ('ink', '#25212d', 'body ink'), ('muted', '#75717e', '--muted'),
                ('line', '#e8e7ed', '--line'), ('activeInk', '#168252', 'status active'),
                ('activeBg', '#e4f7ed', 'status active bg'), ('danger', '#d93b55', 'danger'),
                ('errBg', '#fff0f3', 'error bg'), ('badgeBg', '#effaf4', 'controlled badge')]
    for i, (key, hexv, label) in enumerate(swatches):
        sx = 80 + (i % 6) * 118
        sy = py + (i // 6) * 96
        f.rect(sx, sy, 100, 52, fill=hexv, stroke=C['line'], rx=6)
        f.textc(sx, sy + 66, hexv, 9, weight=600, mono=True)
        f.textc(sx, sy + 80, label, 8, fill=C['muted'])

    # type scale
    py = panel(820, 130, 720, 250, 'Type scale · Poppins')
    scale = [('31 / 500', 'Computational Basis', 31, 500, C['violet']),
             ('17 / 500', 'Modal and drawer titles', 17, 500, C['ink']),
             ('12 / 600', 'Section heading', 12, 600, C['ink']),
             ('10.5 / 400', 'Table cell', 10.5, 400, C['ink']),
             ('9.5 / 500', 'Form label', 9.5, 500, C['label']),
             ('8 / 400', 'Caption and hint', 8, 400, C['muted']),
             ('8 / 400 mono', '{{hourly_rate}} * {{ot_rate}}', 8, 400, C['formulaInk'])]
    for i, (spec, sample, size, weight, ink) in enumerate(scale):
        ly = py + 14 + i * 27
        f.textc(840, ly, spec, 8.5, fill=C['muted'], mono=True)
        f.textc(940, ly, sample, size, fill=ink, weight=weight,
                mono='mono' in spec)

    # controls
    py = panel(60, 400, 740, 300, 'Controls')
    button(f, 80, py + 20, 'Primary action', 'primary', icon='plus')
    button(f, 240, py + 20, 'Secondary', 'secondary', icon='download')
    button(f, 380, py + 20, 'Danger', 'danger', icon='trash')
    f.textc(80, py + 56, '.button 38px · radius 4 · 11/500', 8, fill=C['muted'])

    px = 80
    for label in ('Active', 'Inactive', 'Draft'):
        px += status_pill(f, px, py + 90, label) + 10
    px += 14
    px += source_chip(f, px, py + 90, True) + 10
    source_chip(f, px, py + 90, False)
    f.textc(80, py + 112, '.status-pill 22px · .computation-source 21px', 8,
            fill=C['muted'])

    switch(f, 80, py + 148, True)
    switch(f, 130, py + 148, False)
    chip(f, 190, py + 148, 'Hourly rate')
    f.rect(300, py + 137, 22 + tw('Version 1.0', 8), 22, fill=C['violetSoft'], rx=11)
    f.textc(311, py + 148, 'Version 1.0', 8, fill=C['violet'])
    f.textc(80, py + 172, '.switch 34×19 · .mapped-chip-list · .version-chip',
            8, fill=C['muted'])

    toolbar_search(f, 80, py + 218, 300, 'Search code, computation...')
    compact_select(f, 396, py + 218, 'All categories')
    input_box(f, 562, py + 198, 180, 'Overtime Pay')
    f.textc(80, py + 248, '.search-box 40px · .compact-select 37px · input 40px', 8,
            fill=C['muted'])

    # feedback + icons
    py = panel(820, 400, 720, 300, 'Feedback and icons')
    f.rect(840, py + 8, 300, 47, fill=C['testBg'], rx=6)
    f.icon('check', 853, py + 22.5, 18, C['testInk'], sw=2.6)
    f.textc(880, py + 24, 'Formula passed', 7.5, fill=C['testInk'])
    f.textc(880, py + 40, '₱ 1,293.08', 13, fill=C['testInk'], weight=600)
    f.rect(1160, py + 8, 360, 47, fill=C['errBg'], rx=5)
    f.para(1172, py + 26, 'Only mapped fields, numbers, parentheses, and available '
                          'operators are allowed.', 9, fill=C['errInk'], max_w=336,
           line_h=13)
    f.textc(840, py + 74, '.test-result.passed · .basis-error', 8, fill=C['muted'])

    f.rect(840, py + 92, 680, 46, fill=C['noticeBg'], stroke=C['noticeLine'], rx=6)
    f.icon('lock', 853, py + 105, 20, C['violet'])
    f.textc(883, py + 108, 'Built-in formulas are read-only; company calculations are '
                           'editable here.', 9, fill=C['violet'], weight=600)
    f.textc(883, py + 122, 'Create a governed computation with the approved field and '
                           'operator palette.', 9, fill=C['noticeInk'])
    f.textc(840, py + 156, '.library-notice', 8, fill=C['muted'])

    icons = ['function', 'table', 'check', 'clockCounter', 'magnifier', 'plus', 'upload',
             'download', 'fileCsv', 'filePdf', 'eye', 'pencil', 'trash', 'lock', 'flask',
             'x', 'shieldCheck', 'calculator', 'info', 'checkCircle', 'warning',
             'caretDown', 'caretRight', 'arrowLeft']
    for i, key in enumerate(icons):
        ix = 840 + (i % 12) * 56
        iy = py + 180 + (i // 12) * 48
        f.rect(ix, iy, 40, 40, fill=C['violetSoft'], rx=8)
        f.icon(key, ix + 10, iy + 10, 20, C['violet'])
    f.textc(840, py + 278, 'Phosphor Icons · simplified stand-ins — swap for the '
                           'real @phosphor-icons set in Figma', 8, fill=C['muted'])

    # spacing note
    py = panel(60, 720, 1480, 280, 'Layout')
    rows = [
        ('Shell grid', '78px brand rail · 290px company sidebar · fluid main (App.jsx .company-screen)'),
        ('Topbar', '78px on the company screen, 88px on Core'),
        ('Page content', 'padding 7px 42px 28px · max-width 1260px'),
        ('Summary cards', '4 × minmax(145px, 1fr), 12px gap, 79px min-height'),
        ('Module tabs', '45px bar, radius 7 7 0 0, 44px buttons, 2px violet underline'),
        ('Tables', '.config-table th 9/10px padding, td 8/10px, 1px #ecebf0 row rule; .basis-table min-width 980px'),
        ('Reference grid', 'repeat(3, minmax(230px, 1fr)), 12px gap, 215px min-height'),
        ('Modal widths', 'formula editor 930 · reference table 980 · assignment 700 · delete 480 · drawer 520'),
        ('Breakpoints', '1080px → 2-up summary and reference grid; 760px → single column forms'),
        ('Elevation', 'styles.css uses box-shadow (0 4px 16px rgba(50,38,63,.04)); Figma drops SVG filters, so cards here carry their 1px border only'),
    ]
    for i, (label, value) in enumerate(rows):
        ly = py + 14 + i * 23
        f.textc(80, ly, label, 9, weight=600)
        f.textc(230, ly, value, 9, fill=C['muted'])
    return f, height


# ---------------------------------------------------------------------- main

FRAMES = [
    ('01-computations.svg', frame_computations),
    ('02-client-assignments.svg', frame_assignments),
    ('03-policy-engines.svg', frame_policy_engines),
    ('04-reference-sources.svg', frame_references),
    ('05-change-history.svg', frame_history),
    ('06-modal-formula-setup.svg', frame_editor_formula),
    ('07-modal-test-calculation.svg', frame_editor_test),
    ('08-modal-change-details.svg', frame_editor_change),
    ('09-drawer-computation-detail.svg', frame_drawer),
    ('10-modal-add-assignment.svg', frame_assignment_modal),
    ('11-modal-reference-table.svg', frame_reference_modal),
    ('12-modal-delete-computation.svg', frame_delete_modal),
    ('13-style-sheet.svg', frame_style_sheet),
]


def main():
    for filename, builder in FRAMES:
        frame, height = builder()
        path = os.path.join(OUT, filename)
        frame.save(path, height)
        print('%-34s %4d x %4d' % (filename, frame.width, height))


if __name__ == '__main__':
    main()
