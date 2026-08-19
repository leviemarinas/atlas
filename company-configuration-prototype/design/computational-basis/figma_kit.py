"""Primitives for emitting Figma-importable SVG frames.

Every value here is read off company-configuration-prototype/src/styles.css so the
frames measure the same as the running prototype. Figma imports an <svg> root as a
frame, each <g id="..."> as a named group, and <text> as an editable text layer, so
the output stays editable rather than flattening into one picture.

No SVG filters are emitted: Figma discards them on import, so the card elevation in
styles.css is represented by its 1px border instead of its box-shadow.
"""

FONT = "Poppins, Arial, sans-serif"
MONO = "Consolas, 'Courier New', monospace"

# --- tokens (styles.css :root plus the literals used by the basis screens) -----
C = {
    'violet': '#54248f',
    'violet2': '#7c3fc2',
    'violetSoft': '#f2ebfa',
    'canvas': '#f7f8fb',
    'shellBg': '#eef0f5',
    'muted': '#75717e',
    'line': '#e8e7ed',
    'ink': '#25212d',
    'white': '#ffffff',
    'railTop': '#4b187e',
    'railMid': '#6e2cb4',
    'railEnd': '#7940bf',
    'sideBorder': '#ecebf0',
    'sideLink': '#6d587f',
    'crumb': '#9b97a1',
    'inputLine': '#d7d5dc',
    'searchLine': '#dddbe3',
    'secondaryLine': '#b98ee3',
    'thLine': '#d8d6dd',
    'tdLine': '#ecebf0',
    'pillBg': '#eeeaf2',
    'pillInk': '#6d6772',
    'activeBg': '#e4f7ed',
    'activeInk': '#168252',
    'inactiveBg': '#f4edf5',
    'inactiveInk': '#8a668f',
    'badgeLine': '#c9ead9',
    'badgeBg': '#effaf4',
    'badgeInk': '#197a50',
    'noticeLine': '#e2d6ee',
    'noticeBg': '#faf7fd',
    'noticeInk': '#5a4d64',
    'summaryLine': '#ece8f0',
    'summaryNum': '#342d39',
    'tabsBottom': '#d1c1df',
    'tabInk': '#706a75',
    'tabCountBg': '#f0edf2',
    'tabCountInk': '#716a77',
    'titleInk': '#403849',
    'titleSub': '#918b95',
    'formulaInk': '#654980',
    'pageInk': '#77737d',
    'pagerLine': '#e2dfe7',
    'backdrop': '#1a171f',
    'builderLine': '#ded8e5',
    'builderBg': '#fcfbfd',
    'exprLine': '#bda5d4',
    'exprInk': '#4d286f',
    'opLine': '#d9d3df',
    'testInk': '#147b4d',
    'testBg': '#eaf8f1',
    'errInk': '#b52f43',
    'errBg': '#fff0f3',
    'refCardLine': '#e8e3ec',
    'refDlBg': '#f8f7f9',
    'refDt': '#98919d',
    'refDd': '#504858',
    'refName': '#443b4c',
    'refCode': '#8e8794',
    'histInk': '#574f5e',
    'histSmall': '#96909a',
    'histTagInk': '#776e7c',
    'label': '#4e4954',
    'chipBg': '#f1eef3',
    'chipInk': '#66596e',
    'metaBg': '#f8f6fa',
    'metaInk': '#473d4e',
    'linkedLine': '#d8c9e7',
    'danger': '#d93b55',
    'dangerSoft': '#fff0f3',
    'dangerInk': '#d83953',
    'govBg': '#fcfafe',
    'govArrow': '#b9aec6',
    'codeLibLine': '#e4dce9',
    'codeLibHead': '#ece8ef',
    'codeSummaryBg': '#fbfafc',
    'coverLine': '#bfe5d5',
    'coverBg': '#f0faf6',
    'coverInk': '#167251',
    'countLine': '#ded3e7',
    'countBg': '#faf7fd',
    'policyResBg': '#f8f6fa',
    'policyResInk': '#3e3446',
    'okInk': '#167a4d',
    'okBg': '#eaf8f1',
    'toggleOff': '#bbb8c1',
    'readonlyBg': '#f5f2f7',
    'readonlyInk': '#62586a',
}

# --- layout constants (App.jsx company-screen grid + .page-content padding) ---
W = 1600
RAIL = 78
SIDEBAR = 290
MAIN_X = RAIL + SIDEBAR          # 368
TOPBAR_H = 78
PAGE_PAD = 42
CONTENT_X = MAIN_X + PAGE_PAD    # 410
CONTENT_W = W - MAIN_X - PAGE_PAD * 2   # 1148
CONTENT_BOTTOM_PAD = 28


def esc(s):
    return (str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            .replace('"', '&quot;'))


# --- crude Poppins/Consolas advance-width model, good enough for layout ------
_NARROW = set("iljtfr.,:;'|!()[]{} ")
_WIDE = set("mMwWQ@%&")
_UPPER = set("ABCDEFGHIJKLNOPRSTUVXYZ")


def tw(s, size, weight=400, mono=False):
    if mono:
        return len(s) * size * 0.55
    total = 0.0
    for ch in s:
        if ch in _NARROW:
            total += 0.30
        elif ch in _WIDE:
            total += 0.86
        elif ch in _UPPER:
            total += 0.63
        elif ch.isdigit():
            total += 0.58
        else:
            total += 0.545
    factor = 1.03 if weight >= 600 else 1.0
    return total * size * factor


def ellipsize(s, max_w, size, weight=400, mono=False):
    if tw(s, size, weight, mono) <= max_w:
        return s
    out = s
    while out and tw(out + '…', size, weight, mono) > max_w:
        out = out[:-1]
    return out + '…'


# --- simplified Phosphor-style glyphs, drawn in a 24x24 box ------------------
# ('l', x1,y1,x2,y2) line | ('c', cx,cy,r) circle | ('r', x,y,w,h,rx) rect
# ('p', d) path | Upper-case tag = filled instead of stroked.
ICONS = {
    'sparkle': [('P', 'M12 2.6 14.3 9.2 20.9 11.5 14.3 13.8 12 20.4 9.7 13.8 3.1 11.5 9.7 9.2Z')],
    'house': [('p', 'M4 10.5 12 4l8 6.5V20H4Z'), ('p', 'M9.5 20v-5.5h5V20')],
    'cube': [('p', 'M12 3 20.5 7.6v8.8L12 21 3.5 16.4V7.6Z'), ('p', 'M3.5 7.6 12 12l8.5-4.4'), ('l', 12, 12, 12, 21)],
    'users': [('c', 9, 8.5, 3.4), ('p', 'M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5'), ('p', 'M16 5.4a3.4 3.4 0 0 1 0 6.2'), ('p', 'M17.5 14.8c2.1.6 3.5 2.5 3.5 5.2')],
    'clock': [('c', 12, 12, 8.6), ('p', 'M12 7.2V12l3.6 2.4')],
    'currency': [('c', 12, 12, 8.6), ('l', 12, 6.2, 12, 17.8), ('p', 'M14.9 9.2a3 3 0 0 0-2.9-1.3c-1.9 0-3 .9-3 2.2 0 3.4 6 1.4 6 4.6 0 1.4-1.3 2.4-3 2.4a3.4 3.4 0 0 1-3.1-1.5')],
    'gear': [('c', 12, 12, 3.1), ('p', 'M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a1.9 1.9 0 0 1-3.8 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1A1.6 1.6 0 0 0 4 15a1.9 1.9 0 0 1 0-3.8h.2A1.6 1.6 0 0 0 5.3 8.5L5.2 8.4a1.9 1.9 0 1 1 2.7-2.7L8 5.8a1.6 1.6 0 0 0 2.7-1.1v-.3a1.9 1.9 0 0 1 3.8 0v.2a1.6 1.6 0 0 0 2.8 1.1l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.6 1.6 0 0 0 1.1 2.7 1.9 1.9 0 0 1 0 3.8h-.3Z')],
    'signout': [('p', 'M14 4.5H19a1 1 0 0 1 1 1V18.5a1 1 0 0 1-1 1h-5'), ('l', 4, 12, 14.5, 12), ('p', 'M9 7.5 4 12l5 4.5')],
    'caretDown': [('p', 'M5.5 9.5 12 15.5l6.5-6')],
    'caretRight': [('p', 'M9.5 5.5 15.5 12l-6 6.5')],
    'arrowLeft': [('l', 20, 12, 4.5, 12), ('p', 'M10.5 5.5 4 12l6.5 6.5')],
    'magnifier': [('c', 10.6, 10.6, 6.6), ('l', 15.4, 15.4, 20.2, 20.2)],
    'bell': [('p', 'M6 10.5a6 6 0 0 1 12 0c0 4 1.4 5.4 1.9 6H4.1c.5-.6 1.9-2 1.9-6Z'), ('p', 'M9.6 20a2.6 2.6 0 0 0 4.8 0')],
    'plus': [('l', 12, 5, 12, 19), ('l', 5, 12, 19, 12)],
    'upload': [('l', 12, 16.5, 12, 4.5), ('p', 'M7.5 9 12 4.5 16.5 9'), ('p', 'M4 15v3.5a1.5 1.5 0 0 0 1.5 1.5h13a1.5 1.5 0 0 0 1.5-1.5V15')],
    'download': [('l', 12, 4.5, 12, 16.5), ('p', 'M7.5 12 12 16.5 16.5 12'), ('p', 'M4 15v3.5a1.5 1.5 0 0 0 1.5 1.5h13a1.5 1.5 0 0 0 1.5-1.5V15')],
    'fileCsv': [('p', 'M6 3.5h8L19 8.5V20.5H6Z'), ('p', 'M13.8 3.5V9h5'), ('l', 8.5, 13.5, 15.5, 13.5), ('l', 8.5, 17, 13.5, 17)],
    'filePdf': [('p', 'M6 3.5h8L19 8.5V20.5H6Z'), ('p', 'M13.8 3.5V9h5'), ('R', 8.5, 12.5, 7, 5.5, 1)],
    'check': [('p', 'M4.5 12.8 9.5 17.8 19.5 6.6')],
    'checkCircle': [('C', 12, 12, 9), ('p', 'M7.8 12.3 10.8 15.3 16.2 9.2', '#ffffff')],
    'warning': [('P', 'M12 3.2 22 20.4H2Z'), ('l', 12, 9, 12, 14.4, '#ffffff'), ('C', 12, 17.3, 1.1, '#ffffff')],
    'info': [('C', 12, 12, 9), ('l', 12, 11, 12, 16.4, '#ffffff'), ('C', 12, 8.2, 1.1, '#ffffff')],
    'lock': [('R', 4.5, 10.5, 15, 9.5, 1.6), ('p', 'M8 10.5V7.8a4 4 0 0 1 8 0v2.7')],
    'pencil': [('p', 'M4.5 19.5h3.2L19.2 8a2.3 2.3 0 0 0-3.2-3.2L4.5 16.3Z'), ('l', 14.6, 6.2, 17.8, 9.4)],
    'eye': [('p', 'M2.5 12S6 6.4 12 6.4 21.5 12 21.5 12 18 17.6 12 17.6 2.5 12 2.5 12Z'), ('c', 12, 12, 3.1)],
    'trash': [('l', 4, 7, 20, 7), ('p', 'M6.5 7v12a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5V7'), ('p', 'M9.5 7V4.8h5V7'), ('l', 10.3, 10.6, 10.3, 17), ('l', 13.7, 10.6, 13.7, 17)],
    'x': [('l', 5.5, 5.5, 18.5, 18.5), ('l', 18.5, 5.5, 5.5, 18.5)],
    'flask': [('p', 'M9 3.5h6'), ('p', 'M10 3.5v5.2L4.8 18a1.6 1.6 0 0 0 1.4 2.5h11.6a1.6 1.6 0 0 0 1.4-2.5L14 8.7V3.5'), ('l', 6.6, 14.2, 17.4, 14.2)],
    'function': [('p', 'M8 20.5V8.2a4 4 0 0 1 4-4h1.6'), ('l', 5.6, 11.6, 13.4, 11.6)],
    'table': [('R', 3.5, 4.5, 17, 15, 1.6), ('l', 3.5, 9.6, 20.5, 9.6, '#ffffff'), ('l', 3.5, 14.8, 20.5, 14.8, '#ffffff'), ('l', 11.2, 9.6, 11.2, 19.5, '#ffffff')],
    'clockCounter': [('p', 'M4.4 9.6H9V5'), ('p', 'M6.3 6.3a8.1 8.1 0 1 1-1.9 6.5'), ('p', 'M12 8v4.4l3.4 2.2')],
    'shieldCheck': [('p', 'M12 3.2 20 6v6c0 5-4.6 7.7-8 8.8-3.4-1.1-8-3.8-8-8.8V6Z'), ('p', 'M8.6 11.9 11.2 14.5 15.6 9.7')],
    'calculator': [('R', 5, 3.5, 14, 17, 1.8), ('r', 8, 6.6, 8, 3.2, 0.6, '#ffffff'), ('C', 9.2, 13.4, 1.05, '#ffffff'), ('C', 12, 13.4, 1.05, '#ffffff'), ('C', 14.8, 13.4, 1.05, '#ffffff'), ('C', 9.2, 17, 1.05, '#ffffff'), ('C', 12, 17, 1.05, '#ffffff'), ('C', 14.8, 17, 1.05, '#ffffff')],
    'buildings': [('R', 3.5, 8, 8, 12, 1), ('R', 13, 4, 7.5, 16, 1), ('l', 6, 11.5, 8.5, 11.5, '#ffffff'), ('l', 6, 15.5, 8.5, 15.5, '#ffffff'), ('l', 15.4, 8, 18.2, 8, '#ffffff'), ('l', 15.4, 12, 18.2, 12, '#ffffff'), ('l', 15.4, 16, 18.2, 16, '#ffffff')],
    'wrench': [('p', 'M14.6 9.4a4.6 4.6 0 1 0-4.5-5.6l3 3-2.6 2.6-3-3a4.6 4.6 0 0 0 5.5 4.6l5.3 5.3a2.2 2.2 0 1 1-3.1 3.1L9.9 14')],
    'calendar': [('R', 3.5, 5.5, 17, 15, 1.6), ('l', 3.5, 10, 20.5, 10, '#ffffff'), ('l', 8, 3, 8, 5.5), ('l', 16, 3, 16, 5.5)],
    'idCard': [('R', 2.5, 5.5, 19, 13, 1.8), ('c', 8.4, 11.2, 2.2), ('p', 'M5.2 16c.5-1.6 1.7-2.5 3.2-2.5S11.1 14.4 11.6 16'), ('l', 14.5, 10, 18.6, 10), ('l', 14.5, 13.4, 18.6, 13.4)],
    'checkC': [('c', 12, 12, 8.8), ('p', 'M8 12.3 10.9 15.2 16.1 9.4')],
    'firstAid': [('R', 3, 6.5, 18, 12, 1.8), ('l', 12, 9.6, 12, 15.4), ('l', 9.1, 12.5, 14.9, 12.5), ('p', 'M8.8 6.5V4.8h6.4v1.7')],
    'scales': [('l', 12, 4, 12, 20), ('l', 5.5, 7.5, 18.5, 7.5), ('p', 'M8.6 7.5 5.4 14.4h6.4Z'), ('p', 'M15.4 7.5 12.2 14.4h6.4Z')],
    'puzzle': [('p', 'M10 4.5h4v1.8a1.8 1.8 0 1 0 3.6 0V4.5H20v5.3h-1.8a1.8 1.8 0 1 0 0 3.6H20v6.1h-5.4v-1.8a1.8 1.8 0 1 0-3.6 0v1.8H4v-6.1h1.8a1.8 1.8 0 1 0 0-3.6H4V4.5Z')],
}


class Frame:
    """One SVG document: Figma reads the root <svg> as a frame."""

    def __init__(self, name, width=W, bg=None):
        self.name = name
        self.width = width
        self.bg = bg or C['canvas']
        self.parts = []
        self.defs = []
        self.height = 0

    # -- raw ------------------------------------------------------------------
    def raw(self, s):
        self.parts.append(s)

    def open(self, name):
        self.parts.append('<g id="%s">' % esc(name))

    def close(self):
        self.parts.append('</g>')

    # -- shapes ---------------------------------------------------------------
    def rect(self, x, y, w, h, fill=None, stroke=None, rx=0, sw=1, name=None,
             opacity=None, rxy=None):
        a = ['x="%s" y="%s" width="%s" height="%s"' % (n(x), n(y), n(w), n(h))]
        if rx:
            a.append('rx="%s"' % n(rx))
        if rxy:
            a.append('ry="%s"' % n(rxy))
        a.append('fill="%s"' % (fill if fill else 'none'))
        if stroke:
            a.append('stroke="%s" stroke-width="%s"' % (stroke, n(sw)))
        if opacity is not None:
            a.append('opacity="%s"' % n(opacity))
        if name:
            a.append('id="%s"' % esc(name))
        self.parts.append('<rect %s/>' % ' '.join(a))

    def rounded_top(self, x, y, w, h, r, fill=None, stroke=None, sw=1):
        """Rectangle with only its top corners rounded (.basis-tabs)."""
        d = ('M{x} {b} V{ty} A{r} {r} 0 0 1 {x1} {y} H{x2} A{r} {r} 0 0 1 {xr} {ty} V{b} Z'
             .format(x=n(x), b=n(y + h), ty=n(y + r), r=n(r), x1=n(x + r), y=n(y),
                     x2=n(x + w - r), xr=n(x + w)))
        a = ['d="%s"' % d, 'fill="%s"' % (fill or 'none')]
        if stroke:
            a.append('stroke="%s" stroke-width="%s"' % (stroke, n(sw)))
        self.parts.append('<path %s/>' % ' '.join(a))

    def line(self, x1, y1, x2, y2, stroke, sw=1):
        self.parts.append('<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="%s" stroke-width="%s"/>'
                          % (n(x1), n(y1), n(x2), n(y2), stroke, n(sw)))

    def circle(self, cx, cy, r, fill=None, stroke=None, sw=1):
        a = ['cx="%s" cy="%s" r="%s"' % (n(cx), n(cy), n(r)), 'fill="%s"' % (fill or 'none')]
        if stroke:
            a.append('stroke="%s" stroke-width="%s"' % (stroke, n(sw)))
        self.parts.append('<circle %s/>' % ' '.join(a))

    # -- text -----------------------------------------------------------------
    def text(self, x, y, s, size=11, fill=None, weight=400, anchor='start',
             mono=False, spacing=None, upper=False):
        """y is the text baseline."""
        if upper:
            s = str(s).upper()
        a = ['x="%s" y="%s"' % (n(x), n(y)),
             'font-family="%s"' % (MONO if mono else FONT),
             'font-size="%s"' % n(size),
             'fill="%s"' % (fill or C['ink'])]
        if weight != 400:
            a.append('font-weight="%s"' % weight)
        if anchor != 'start':
            a.append('text-anchor="%s"' % anchor)
        if spacing:
            a.append('letter-spacing="%s"' % n(spacing))
        self.parts.append('<text %s>%s</text>' % (' '.join(a), esc(s)))

    def textc(self, x, cy, s, size=11, **kw):
        """Vertically centred on cy (cap-height midpoint)."""
        self.text(x, cy + size * 0.355, s, size, **kw)

    def para(self, x, y, s, size=11, fill=None, weight=400, max_w=400,
             line_h=None, mono=False, max_lines=None):
        """Word-wrapped paragraph. y is the first baseline. Returns lines used."""
        lh = line_h or size * 1.55
        words = str(s).split()
        lines, cur = [], ''
        for word in words:
            trial = (cur + ' ' + word).strip()
            if tw(trial, size, weight, mono) <= max_w or not cur:
                cur = trial
            else:
                lines.append(cur)
                cur = word
        if cur:
            lines.append(cur)
        if max_lines and len(lines) > max_lines:
            lines = lines[:max_lines]
            lines[-1] = ellipsize(lines[-1] + ' …', max_w, size, weight, mono)
        for i, ln in enumerate(lines):
            self.text(x, y + i * lh, ln, size, fill=fill, weight=weight, mono=mono)
        return len(lines)

    def para_h(self, s, size=11, max_w=400, weight=400, line_h=None, mono=False):
        lh = line_h or size * 1.55
        words = str(s).split()
        lines, cur = 1, ''
        for word in words:
            trial = (cur + ' ' + word).strip()
            if tw(trial, size, weight, mono) <= max_w or not cur:
                cur = trial
            else:
                lines += 1
                cur = word
        return lines * lh

    # -- icon -----------------------------------------------------------------
    def icon(self, key, x, y, size, color, sw=1.9):
        prims = ICONS.get(key)
        if not prims:
            self.rect(x, y, size, size, stroke=color, rx=size * 0.2)
            return
        scale = size / 24.0
        self.parts.append('<g transform="translate(%s %s) scale(%s)" fill="none" stroke="%s" '
                          'stroke-width="%s" stroke-linecap="round" stroke-linejoin="round">'
                          % (n(x), n(y), n(scale, 4), color, n(sw / scale)))
        for p in prims:
            tag = p[0]
            over = None
            if isinstance(p[-1], str) and p[-1].startswith('#') and tag not in ('p', 'P'):
                over = p[-1]
                p = p[:-1]
            elif tag in ('p', 'P') and len(p) == 3:
                over = p[2]
                p = p[:2]
            col = over or color
            if tag == 'l':
                self.parts.append('<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="%s"/>'
                                  % (n(p[1]), n(p[2]), n(p[3]), n(p[4]), col))
            elif tag == 'c':
                self.parts.append('<circle cx="%s" cy="%s" r="%s" stroke="%s"/>'
                                  % (n(p[1]), n(p[2]), n(p[3]), col))
            elif tag == 'C':
                self.parts.append('<circle cx="%s" cy="%s" r="%s" fill="%s" stroke="none"/>'
                                  % (n(p[1]), n(p[2]), n(p[3]), col))
            elif tag == 'r':
                self.parts.append('<rect x="%s" y="%s" width="%s" height="%s" rx="%s" stroke="%s"/>'
                                  % (n(p[1]), n(p[2]), n(p[3]), n(p[4]), n(p[5]), col))
            elif tag == 'R':
                self.parts.append('<rect x="%s" y="%s" width="%s" height="%s" rx="%s" fill="%s" stroke="none"/>'
                                  % (n(p[1]), n(p[2]), n(p[3]), n(p[4]), n(p[5]), col))
            elif tag == 'p':
                self.parts.append('<path d="%s" stroke="%s"/>' % (p[1], col))
            elif tag == 'P':
                self.parts.append('<path d="%s" fill="%s" stroke="none"/>' % (p[1], col))
        self.parts.append('</g>')

    # -- output ---------------------------------------------------------------
    def save(self, path, height):
        self.height = height
        head = ('<svg xmlns="http://www.w3.org/2000/svg" width="%s" height="%s" '
                'viewBox="0 0 %s %s">' % (n(self.width), n(height), n(self.width), n(height)))
        defs = ''
        if self.defs:
            defs = '<defs>%s</defs>' % ''.join(self.defs)
        body = ('<rect x="0" y="0" width="%s" height="%s" fill="%s"/>'
                % (n(self.width), n(height), self.bg)) + ''.join(self.parts)
        doc = '%s%s<g id="%s">%s</g></svg>' % (head, defs, esc(self.name), body)
        with open(path, 'w', encoding='utf-8') as fh:
            fh.write(doc)
        return doc


def n(v, places=2):
    if isinstance(v, int):
        return str(v)
    r = round(float(v), places)
    if r == int(r):
        return str(int(r))
    return ('%.*f' % (places, r)).rstrip('0').rstrip('.')


# --- reusable components ------------------------------------------------------
def button(f, x, cy, label, kind='primary', icon=None, caret=False, height=38,
           font=11, pad=15, gap=7, icon_size=15, min_w=None):
    """Draws a .button and returns its width."""
    w = pad * 2 + tw(label, font, 500)
    if icon:
        w += icon_size + gap
    if caret:
        w += 13 + 6
    if min_w:
        w = max(w, min_w)
    y = cy - height / 2.0
    if kind == 'primary':
        fill, stroke, ink = C['violet'], None, C['white']
    elif kind == 'danger':
        fill, stroke, ink = C['danger'], None, C['white']
    else:
        fill, stroke, ink = C['white'], C['secondaryLine'], '#7a40b4'
    f.rect(x, y, w, height, fill=fill, stroke=stroke, rx=4)
    cx = x + pad
    if icon:
        f.icon(icon, cx, cy - icon_size / 2.0, icon_size, ink)
        cx += icon_size + gap
    f.textc(cx, cy, label, font, fill=ink, weight=500)
    if caret:
        f.icon('caretDown', x + w - pad - 13, cy - 6.5, 13, ink)
    return w


def status_pill(f, x, cy, label, height=22, font=9):
    key = str(label).lower()
    bg, ink = C['pillBg'], C['pillInk']
    if key == 'active':
        bg, ink = C['activeBg'], C['activeInk']
    elif key == 'inactive':
        bg, ink = C['inactiveBg'], C['inactiveInk']
    elif key == 'draft':
        bg, ink = '#fff7df', '#8a620e'
    elif key == 'disabled':
        bg, ink = '#fbeeee', '#8a5656'
    w = 18 + tw(label, font, 600)
    f.rect(x, cy - height / 2.0, w, height, fill=bg, rx=height / 2.0)
    f.textc(x + 9, cy, label, font, fill=ink, weight=600)
    return w


def switch(f, x, cy, on=True):
    f.rect(x, cy - 9.5, 34, 19, fill=C['violet'] if on else C['toggleOff'], rx=12)
    f.circle(x + (17 + 9.5 if on else 9.5), cy, 7.5, fill=C['white'])
    return 34


def input_box(f, x, y, w, value, height=40, font=11, placeholder=False,
              caret=False, mono=False, readonly=False, ink=None):
    f.rect(x, y, w, height, fill=C['readonlyBg'] if readonly else C['white'],
           stroke=C['inputLine'], rx=4)
    col = ink or (C['muted'] if placeholder else (C['readonlyInk'] if readonly else '#39343e'))
    f.textc(x + 10, y + height / 2.0, ellipsize(value, w - (34 if caret else 20), font, mono=mono),
            font, fill=col, mono=mono)
    if caret:
        f.icon('caretDown', x + w - 22, y + height / 2.0 - 6, 12, C['muted'])


def field(f, x, y, w, label, value, height=40, font=11, label_font=9.5,
          caret=False, mono=False, readonly=False, gap=5, placeholder=False):
    """A .basis-form-grid / .policy-form-grid label + control. Returns block height."""
    f.text(x, y + label_font * 1.05, label, label_font, fill=C['label'], weight=500)
    top = y + label_font * 1.35 + gap
    input_box(f, x, top, w, value, height=height, font=font, caret=caret, mono=mono,
              readonly=readonly, placeholder=placeholder)
    return (top + height) - y


def textarea(f, x, y, w, h, value, font=11, mono=False, line_h=None, ink=None,
             stroke=None, fill=None):
    f.rect(x, y, w, h, fill=fill or C['white'], stroke=stroke or C['inputLine'], rx=4)
    f.para(x + 10, y + 10 + font * 0.9, value, font, fill=ink or '#39343e',
           max_w=w - 20, mono=mono, line_h=line_h or font * 1.5)


def card(f, x, y, w, h, rx=8, stroke=None, fill=None):
    f.rect(x, y, w, h, fill=fill or C['white'], stroke=stroke or C['line'], rx=rx)


def chip(f, x, cy, label, font=8, bg=None, ink=None, pad=8, height=22, radius=12):
    w = pad * 2 + tw(label, font)
    f.rect(x, cy - height / 2.0, w, height, fill=bg or C['chipBg'], rx=radius)
    f.textc(x + pad, cy, label, font, fill=ink or C['chipInk'])
    return w


def table_header(f, x, y, cols, font=10.5, pad_x=10, pad_y=9, line=None):
    """cols: list of (label, width, align). Returns header height."""
    h = pad_y * 2 + font * 1.35
    cx = x
    for label, cw, *rest in cols:
        align = rest[0] if rest else 'start'
        tx = cx + pad_x if align == 'start' else (cx + cw / 2.0 if align == 'middle' else cx + cw - pad_x)
        f.textc(tx, y + h / 2.0, label, font, weight=600, anchor=align)
        cx += cw
    f.line(x, y + h, x + sum(c[1] for c in cols), y + h, line or C['thLine'])
    return h
