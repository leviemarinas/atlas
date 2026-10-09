"""The shell every Computational Basis frame sits inside.

Brand rail, company sidebar, topbar, page heading, summary cards and the module
tab strip — all measured from AppChrome.jsx, App.jsx and styles.css.
"""

from figma_kit import (C, CONTENT_W, CONTENT_X, MAIN_X, PAGE_PAD, RAIL, SIDEBAR,
                       TOPBAR_H, W, button, chip, n, status_pill, switch, tw)

SIDE_ITEMS = [
    ('Company Information', 'buildings'),
    ('Services Information', 'wrench'),
    ('Calendar Settings', 'calendar'),
    ('Employee Onboarding', 'idCard'),
    ('Employee Requests', 'clockCounter'),
    ('Employee Charge Codes', 'currency'),
    ('Happiness Meter', 'checkC'),
    ('Health & Wellness', 'firstAid'),
    ('Notifications', 'bell'),
    ('FAQ & Help', 'info'),
    ('Company Rules', 'scales'),
    ('Connected Systems', 'puzzle'),
]

TABS = [
    ('Computations', '219'),
    ('Client assignments', '6'),
    ('Policy engines', '4'),
    ('Reference sources', '30'),
    ('Change history', None),
]

SUMMARY = [
    ('function', '219', 'governed computations'),
    ('table', '30', 'formula reference sources'),
    ('check', '209', 'active computations'),
    ('clockCounter', '6', 'client assignments'),
]


def brand_rail(f, height):
    """.brand-rail — 78px, vertical violet gradient, 46px rail buttons."""
    f.defs.append(
        '<linearGradient id="rail" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0%" stop-color="{a}"/><stop offset="68%" stop-color="{b}"/>'
        '<stop offset="100%" stop-color="{c}"/></linearGradient>'.format(
            a=C['railTop'], b=C['railMid'], c=C['railEnd'])
    )
    f.open('Brand rail')
    f.rect(0, 0, RAIL, height, fill='url(#rail)')
    f.icon('sparkle', 39 - 21.5, 17 + 4.5, 43, C['white'], sw=0)
    top = [('house', False), ('cube', True), ('users', False), ('clock', False),
           ('currency', False)]
    y = 84
    for key, active in top:
        _rail_button(f, y, key, active)
        y += 46 + 13
    _rail_button(f, height - 17 - 46 - 13 - 46, 'gear', False)
    _rail_button(f, height - 17 - 46, 'signout', False, dim=True)
    f.close()


def _rail_button(f, y, key, active, dim=False):
    if active:
        f.rect(RAIL / 2.0 - 23, y, 46, 46, fill=C['white'], rx=8)
        f.icon(key, RAIL / 2.0 - 11.5, y + 11.5, 23, C['violet'])
    else:
        f.icon(key, RAIL / 2.0 - 11.5, y + 11.5, 23, '#ffffff')
        if dim:
            pass


def sidebar(f, height, selected='Services Information'):
    """.company-sidebar — 290px white column, 41px nav rows with a 3px gap."""
    f.open('Company sidebar')
    f.rect(RAIL, 0, SIDEBAR, height, fill=C['white'])
    f.line(RAIL + SIDEBAR, 0, RAIL + SIDEBAR, height, C['sideBorder'])

    bx = RAIL + 20 + 5
    f.icon('arrowLeft', bx, 25 - 1, 14, C['violet'])
    f.textc(bx + 14 + 7, 25 + 7, 'Back to Core', 11, fill=C['violet'], weight=500)

    hx = RAIL + 20 + 6
    f.text(hx, 56 + 20, 'Company', 25, weight=500, spacing=-0.6)
    f.text(hx, 56 + 20 + 28.5, 'Configuration', 25, weight=500, spacing=-0.6)

    y = 133
    for label, icon in SIDE_ITEMS:
        active = label == selected
        if active:
            f.rect(RAIL + 20, y, SIDEBAR - 40, 41, fill=C['violet'], rx=6)
        ink = C['white'] if active else C['sideLink']
        f.icon(icon, RAIL + 20 + 12, y + 20.5 - 8, 16, ink)
        f.textc(RAIL + 20 + 12 + 16 + 10, y + 20.5, label, 12, fill=ink,
                weight=500 if active else 400)
        y += 44
    f.close()
    return y


def topbar(f):
    """.topbar on .company-main — 78px tall."""
    f.open('Topbar')
    f.rect(MAIN_X, 0, W - MAIN_X, TOPBAR_H, fill=C['canvas'])
    cy = TOPBAR_H / 2.0
    x = MAIN_X + PAGE_PAD
    f.textc(x, cy, 'ABC Company Ltd', 14, weight=600)
    x += tw('ABC Company Ltd', 14, 600) + 10
    f.textc(x, cy + 0.5, 'ABC-PH-001', 8, fill=C['muted'], weight=600, mono=True)
    x += tw('ABC-PH-001', 8, 600, mono=True) + 10
    f.icon('caretDown', x, cy - 6.5, 13, C['ink'], sw=2.4)

    right = W - PAGE_PAD
    f.icon('caretDown', right - 13, cy - 6.5, 13, C['ink'], sw=2.4)
    right -= 13 + 6
    f.textc(right, cy, 'John Doe', 13, weight=600, anchor='end')
    right -= tw('John Doe', 13, 600) + 5
    f.circle(right - 19, cy, 19, fill='#22333f')
    f.circle(right - 19, cy, 17.5, stroke='#dfb376', sw=3)
    f.textc(right - 19, cy, 'JD', 12, fill=C['white'], weight=600, anchor='middle')
    right -= 38 + 9
    f.icon('bell', right - 30.5, cy - 10.5, 21, C['ink'])
    f.circle(right - 12, cy - 8.5, 3, fill='#f14e62')
    right -= 40 + 9
    f.icon('magnifier', right - 30.5, cy - 10.5, 21, C['ink'])
    right -= 40 + 9

    roles = [('Client Admin', True), ('P&A Admin', False)]
    widths = [24 + 15 + 5 + tw(label, 10, 500) for label, _ in roles]
    total = 6 + sum(widths) + 2
    rx = right - total
    f.rect(rx, cy - 14.5, total, 29, fill='#faf7fd', stroke='#e2d6ee', rx=14.5)
    bx = rx + 3
    for (label, active), bw in zip(roles, widths):
        if active:
            f.rect(bx, cy - 11.5, bw, 23, fill=C['violet'], rx=11.5)
        ink = C['white'] if active else '#6f6976'
        f.icon('shieldCheck' if active else 'users', bx + 12, cy - 7.5, 15, ink)
        f.textc(bx + 12 + 20, cy, label, 10, fill=ink, weight=500)
        bx += bw + 2
    f.close()


def page_heading(f, y):
    """.inline-back + .page-heading.basis-heading. Returns the next y."""
    f.open('Page heading')
    f.icon('arrowLeft', CONTENT_X, y + 1, 14, C['violet'])
    f.textc(CONTENT_X + 21, y + 8, 'Services Information', 10.5, fill=C['violet'], weight=500)
    y += 22

    f.textc(CONTENT_X, y + 6.7,
            'Company Information / Services Information / Computational Basis', 10,
            fill=C['crumb'])
    f.text(CONTENT_X, y + 17.5 + 25.5, 'Computational Basis', 31, fill=C['violet'],
           weight=500, spacing=-1.1)
    f.para(CONTENT_X, y + 60.2 + 8.5,
           'Manage Atlas standard formulas, client assignments, policy scenarios, and '
           'linked reference sources used by automatic payroll calculation.',
           11, fill=C['muted'], max_w=720, line_h=17.05)

    label = 'Controlled standard library'
    bw = 24 + 13 + 7 + tw(label, 9, 600)
    bx = CONTENT_X + CONTENT_W - bw
    f.rect(bx, y + 18, bw, 31, fill=C['badgeBg'], stroke=C['badgeLine'], rx=15.5)
    f.icon('check', bx + 12, y + 18 + 9, 13, C['badgeInk'], sw=2.6)
    f.textc(bx + 12 + 20, y + 33.5, label, 9, fill=C['badgeInk'], weight=600)
    f.close()
    return y + 94.3


def summary_cards(f, y):
    """.basis-summary — four 79px cards, 12px gap."""
    f.open('Summary cards')
    cw = (CONTENT_W - 3 * 12) / 4.0
    for i, (icon, value, caption) in enumerate(SUMMARY):
        x = CONTENT_X + i * (cw + 12)
        f.rect(x, y, cw, 79, fill=C['white'], stroke=C['summaryLine'], rx=8)
        f.rect(x + 17, y + 25, 29, 29, fill=C['violetSoft'], rx=8)
        f.icon(icon, x + 17 + 6, y + 25 + 6, 17, C['violet'])
        f.text(x + 17 + 29 + 12, y + 35 + 6, value, 17, fill=C['summaryNum'], weight=600)
        f.text(x + 17 + 29 + 12, y + 35 + 6 + 15, caption, 8.5, fill=C['muted'])
    f.close()
    return y + 79


def tab_strip(f, y, active='Computations'):
    """.basis-tabs — 45px bar, radius 7 7 0 0, 2px violet underline on the active tab."""
    f.open('Module tabs')
    f.rounded_top(CONTENT_X, y, CONTENT_W, 45, 7, fill=C['white'], stroke=C['line'])
    f.line(CONTENT_X, y + 45, CONTENT_X + CONTENT_W, y + 45, C['tabsBottom'])
    x = CONTENT_X + 12
    for label, count in TABS:
        is_active = label == active
        lw = tw(label, 9.5, 500)
        bw = 26 + lw + (5 + max(18, 10 + tw(count, 8)) if count else 0)
        ink = C['violet'] if is_active else C['tabInk']
        f.textc(x + 13, y + 45 - 22, label, 9.5, fill=ink, weight=500)
        if count:
            cw = max(18, 10 + tw(count, 8))
            cx = x + 13 + lw + 5
            f.rect(cx, y + 45 - 22 - 9, cw, 18,
                   fill=C['violetSoft'] if is_active else C['tabCountBg'], rx=9)
            f.textc(cx + cw / 2.0, y + 45 - 22, count, 8,
                    fill=C['violet'] if is_active else C['tabCountInk'], anchor='middle')
        if is_active:
            f.rect(x, y + 43, bw, 2, fill=C['violet'])
        x += bw + 3
    f.close()
    return y + 45


def shell_content(f, active_tab='Computations'):
    """Heading, summary cards and tab strip. Returns the y where tab content starts."""
    y = page_heading(f, TOPBAR_H + 7)
    y = summary_cards(f, y + 18)
    return tab_strip(f, y + 16, active_tab)


def shell_frame(f, height):
    """Rail, sidebar and topbar — drawn last, once the frame height is known.

    None of them overlap the page content, so paint order does not matter.
    """
    brand_rail(f, height)
    sidebar(f, height)
    topbar(f)


def workspace_copy(f, x, y, title, subtitle, max_w=620):
    """.workspace-copy inside .basis-toolbar."""
    f.textc(x, y, title, 13, weight=600)
    f.para(x, y + 16, subtitle, 8.5, fill=C['muted'], max_w=max_w, line_h=11.5)


def report_button(f, x, cy):
    return button(f, x, cy, 'Download report', 'secondary', icon='download', caret=True)
