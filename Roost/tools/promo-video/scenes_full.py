import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from render_promo import *  # noqa

TOTAL_DURATION = 66.0

# ---------------------------------------------------------------------------
# Scene 1: logo reveal (0 - 4s)
# ---------------------------------------------------------------------------
@scene(0.0, 4.0)
def s_logo(layer, d, t, gt):
    icon_r = 90
    cx, cy = W // 2, H // 2 - 60
    scale_t = ease_out_back(local_t(t, 0.0, 0.5))
    size = icon_r * 2 * scale_t
    if size > 1:
        radial_glow(layer, cx, cy, int(size * 1.3), ACCENT, max_alpha=70)
        paste_logo(layer, cx, cy, size)

    word_t = local_t(t, 0.55, 0.85)
    if word_t > 0:
        e = ease_out_cubic(word_t)
        txt = "Roost"
        f3 = F_DISPLAY_BOLD(120)
        ty = cy + icon_r + 70 + (1 - e) * 18
        draw_text(d, (W // 2, ty), txt, f3, rgba(WHITE, int(255 * e)), anchor="ma")

    if local_t(t, 1.3, 4.0) > 0:
        a = ease_out_cubic(local_t(t, 1.3, 1.7))
        f4 = F_BODY(34)
        draw_text(d, (W // 2, cy + icon_r + 210), "The AI agent that finds and negotiates your office lease", f4, rgba(TEXT_SECONDARY, int(255 * a)), anchor="ma")


# ---------------------------------------------------------------------------
# Scene 2: feature list build (4 - 9.5s)
# ---------------------------------------------------------------------------
FEATURES = [
    "AI-Powered Search & Scoring",
    "Fully Autonomous Negotiation",
    "Guardrails That Never Bend",
    "A Negotiator That Learns",
    "Email-Native, Zero Setup",
    "Full Transparency",
]

@scene(4.0, 9.5)
def s_features(layer, d, t, gt):
    cx = W // 2
    icon_size = 90
    icon_cy = H // 2 - 300
    radial_glow(layer, cx, icon_cy, int(icon_size * 1.3), ACCENT, max_alpha=55)
    paste_logo(layer, cx, icon_cy, icon_size)

    f = F_BODY(38)
    n = len(FEATURES)
    row_h = 68
    list_top = icon_cy + 110
    per_item = 0.135
    check_r = 15
    gap = 20
    for i, label in enumerate(FEATURES):
        item_start = 0.06 + i * per_item
        it = local_t(t, item_start, item_start + 0.32)
        if it <= 0:
            continue
        e = ease_out_cubic(it)
        y = list_top + i * row_h
        tw, _ = text_size(d, label, f)
        row_w = check_r * 2 + gap + tw
        row_x0 = cx - row_w / 2 + (1 - e) * 24
        alpha = int(255 * e)
        color = ACCENT if it >= 1 else TEXT_PRIMARY
        d.ellipse([row_x0, y - check_r, row_x0 + check_r * 2, y + check_r], outline=rgba(color, alpha), width=3)
        if it >= 0.4:
            draw_checkmark(d, row_x0 + check_r, y, check_r * 1.1, rgba(color, alpha), width=4)
        draw_text(d, (row_x0 + check_r * 2 + gap, y), label, f, rgba(TEXT_PRIMARY, alpha), anchor="lm")


# ---------------------------------------------------------------------------
# Status-ticker helper scene builder (reused for several transitional beats)
# ---------------------------------------------------------------------------
def ticker_scene(steps, total_span=(0.0, 1.0)):
    def draw(layer, d, t, gt):
        cx, cy = W // 2, H // 2
        step_dur = 1.0 / len(steps)
        idx = min(len(steps) - 1, int(t / step_dur))
        label = steps[idx]
        f = F_MONO(40)
        spin_a = gt * 7
        r = 22
        sx = cx - text_size(d, label, f)[0] / 2 - 55
        d.ellipse([sx - r, cy - r, sx + r, cy + r], outline=rgba(ACCENT, 255), width=3)
        dotx = sx + r * 0.7 * math.cos(spin_a)
        doty = cy + r * 0.7 * math.sin(spin_a)
        d.ellipse([dotx - 5, doty - 5, dotx + 5, doty + 5], fill=rgba(ACCENT, 255))
        draw_text(d, (cx, cy), label, f, TEXT_SECONDARY, anchor="mm")
    return draw


@scene(9.5, 10.6)
def s_status1(layer, d, t, gt):
    ticker_scene(["Tell it what you need..."])(layer, d, t, gt)


# ---------------------------------------------------------------------------
# Scene: intake form mockup (10.6 - 15.5s)
# ---------------------------------------------------------------------------
INTAKE_FIELDS = [
    ("Team size", "25 people"),
    ("Monthly budget", "Rs 7,75,000"),
    ("Area", "Andheri West"),
    ("Must-haves", "Parking, Wi-Fi, Meeting rooms"),
]

@scene(10.6, 15.5)
def s_intake(layer, d, t, gt):
    card = [W // 2 - 560, H // 2 - 340, W // 2 + 560, H // 2 + 340]
    rounded_rect(d, card, 24, fill=rgba(SURFACE, 255), outline=rgba(BORDER, 255), width=2)
    draw_text(d, (card[0] + 40, card[1] + 44), "New Search", F_BODY_BOLD(32), TEXT_PRIMARY, anchor="lm")

    row_h = 130
    top = card[1] + 120
    for i, (label, value) in enumerate(INTAKE_FIELDS):
        item_start = 0.08 + i * 0.16
        it = local_t(t, item_start, item_start + 0.35)
        if it <= 0:
            continue
        e = ease_out_cubic(it)
        y = top + i * row_h
        alpha = int(255 * e)
        draw_text(d, (card[0] + 40, y), label, F_BODY(24), rgba(TEXT_SECONDARY, alpha), anchor="la")
        box = [card[0] + 40, y + 34, card[2] - 40, y + 84]
        rounded_rect(d, box, 12, fill=rgba(SURFACE_RAISED, alpha), outline=rgba(BORDER, alpha), width=2)
        # value fades/types in slightly after the field appears
        vt = local_t(t, item_start + 0.15, item_start + 0.4)
        if vt > 0:
            n_chars = max(1, int(len(value) * ease_in_out_cubic(vt)))
            draw_text(d, (card[0] + 62, y + 59), value[:n_chars], F_BODY(26), rgba(TEXT_PRIMARY, int(255 * ease_out_cubic(vt))), anchor="lm")

    btn_t = local_t(t, 0.85, 1.0)
    if btn_t > 0:
        e = ease_out_back(btn_t)
        bw, bh = 280 * max(e, 0.05), 64
        bx = card[2] - 40 - bw
        by = card[3] - 60
        rounded_rect(d, [bx, by, bx + bw, by + bh], 12, fill=rgba(ACCENT, int(255 * min(1, e))))
        if e > 0.7:
            draw_text(d, (bx + bw / 2, by + bh / 2), "Find My Office", F_BODY_BOLD(24), (6, 33, 15), anchor="mm")


@scene(15.5, 16.6)
def s_status2(layer, d, t, gt):
    ticker_scene(["Scoring listings..."])(layer, d, t, gt)


# ---------------------------------------------------------------------------
# Scene: shortlist cards with animated score badges (16.6 - 22.5s)
# ---------------------------------------------------------------------------
LISTINGS = [
    ("Fully-equipped coworking floor", "Andheri West", "Rs 8,16,500/mo", 87),
    ("Premium tech park office", "Lower Parel", "Rs 7,40,000/mo", 92),
    ("Furnished floor, metro-adjacent", "BKC", "Rs 9,10,000/mo", 78),
]

@scene(16.6, 22.5)
def s_shortlist(layer, d, t, gt):
    draw_text(d, (W // 2, H // 2 - 380), "Your scored shortlist", F_DISPLAY_BOLD(46), TEXT_PRIMARY, anchor="ma")

    card_w, card_h = 480, 480
    gap = 48
    total_w = card_w * 3 + gap * 2
    x0 = W // 2 - total_w // 2
    y0 = H // 2 - 260

    for i, (title, area, rent, score) in enumerate(LISTINGS):
        item_start = 0.1 + i * 0.18
        it = local_t(t, item_start, item_start + 0.4)
        if it <= 0:
            continue
        e = ease_out_cubic(it)
        cx0 = x0 + i * (card_w + gap)
        y = y0 + (1 - e) * 40
        alpha = int(255 * e)
        box = [cx0, y, cx0 + card_w, y + card_h]
        rounded_rect(d, box, 20, fill=rgba(SURFACE, alpha), outline=rgba(BORDER, alpha), width=2)

        # score ring, counts up
        score_t = local_t(t, item_start + 0.15, item_start + 0.55)
        shown_score = int(score * ease_out_cubic(score_t))
        ring_cx, ring_cy, ring_r = cx0 + card_w - 66, y + 66, 40
        d.arc([ring_cx - ring_r, ring_cy - ring_r, ring_cx + ring_r, ring_cy + ring_r], -90, -90 + 360 * (shown_score / 100), fill=rgba(ACCENT, alpha), width=6)
        draw_text(d, (ring_cx, ring_cy), str(shown_score), F_MONO_BOLD(26), rgba(TEXT_PRIMARY, alpha), anchor="mm")

        draw_text(d, (cx0 + 32, y + 40), title, F_BODY_BOLD(26), rgba(TEXT_PRIMARY, alpha), anchor="lm")
        draw_text(d, (cx0 + 32, y + 82), area, F_BODY(22), rgba(TEXT_SECONDARY, alpha), anchor="lm")
        draw_text(d, (cx0 + 32, y + 140), rent, F_MONO_BOLD(28), rgba(LEDGER, alpha), anchor="lm")

        # reasoning bars: cost / commute / amenity
        bars = [("Cost fit", 0.8), ("Commute", 0.65), ("Amenities", 0.9)]
        for bi, (blabel, bval) in enumerate(bars):
            by = y + 200 + bi * 46
            draw_text(d, (cx0 + 32, by), blabel, F_BODY(19), rgba(TEXT_SECONDARY, alpha), anchor="lm")
            bar_box = [cx0 + 32, by + 20, cx0 + card_w - 32, by + 30]
            rounded_rect(d, bar_box, 5, fill=rgba(SURFACE_RAISED, alpha))
            fill_w = (bar_box[2] - bar_box[0]) * bval * ease_out_cubic(local_t(t, item_start + 0.3 + bi * 0.05, item_start + 0.7 + bi * 0.05))
            if fill_w > 2:
                rounded_rect(d, [bar_box[0], bar_box[1], bar_box[0] + fill_w, bar_box[3]], 5, fill=rgba(ACCENT, alpha))


@scene(22.5, 23.6)
def s_status3(layer, d, t, gt):
    ticker_scene(["Emailing landlords..."])(layer, d, t, gt)


# ---------------------------------------------------------------------------
# Scene: outreach email sent (23.6 - 27s)
# ---------------------------------------------------------------------------
@scene(23.6, 27.0)
def s_outreach(layer, d, t, gt):
    card = [W // 2 - 620, H // 2 - 220, W // 2 + 620, H // 2 + 220]
    rounded_rect(d, card, 24, fill=rgba(SURFACE, 255), outline=rgba(BORDER, 255), width=2)
    draw_text(d, (card[0] + 40, card[1] + 40), "To: landlord@example.com", F_BODY(24), TEXT_SECONDARY, anchor="la")
    draw_text(d, (card[0] + 40, card[1] + 78), "Office space inquiry - Fully-equipped coworking floor", F_BODY_BOLD(28), TEXT_PRIMARY, anchor="la")
    line_y = card[1] + 130
    d.line([(card[0] + 40, line_y), (card[2] - 40, line_y)], fill=rgba(BORDER, 255), width=2)
    body = "We'd be looking to move quickly at Rs 7,54,850/month\nagainst the listed Rs 8,16,500 - let us know if that\nworks on your end, or where you'd land."
    ty = line_y + 40
    for line in body.split("\n"):
        draw_text(d, (card[0] + 40, ty), line, F_BODY(28), TEXT_PRIMARY, anchor="la")
        ty += 42

    sent_t = local_t(t, 0.7, 1.0)
    if sent_t > 0:
        e = ease_out_back(sent_t)
        bw, bh = 180 * max(e, 0.05), 56
        bx, by = card[2] - 40 - bw, card[3] - 70
        rounded_rect(d, [bx, by, bx + bw, by + bh], 12, fill=rgba(ACCENT_DIM, 255), outline=rgba(ACCENT, 255), width=2)
        if e > 0.6:
            draw_text(d, (bx + bw / 2, by + bh / 2), "Sent", F_BODY_BOLD(24), ACCENT, anchor="mm")


# ---------------------------------------------------------------------------
# Scene: inbound reply typewriter + timer + sent reply (27 - 35s)
#   *** the specifically-requested "reply under 15 seconds" beat ***
# ---------------------------------------------------------------------------
INBOUND_TEXT = "Rs 8,00,000 is our final number, let us know."
STATUS_STEPS = ["Reading email...", "Classifying intent...", "Drafting reply..."]

@scene(27.0, 35.0)
def s_email_demo(layer, d, t, gt):
    card = [W // 2 - 620, H // 2 - 280, W // 2 + 620, H // 2 + 280]
    rounded_rect(d, card, 24, fill=rgba(SURFACE, 255), outline=rgba(BORDER, 255), width=2)

    header_y = card[1] + 40
    draw_text(d, (card[0] + 40, header_y), "Fully-equipped coworking floor, Andheri West", F_BODY_BOLD(30), TEXT_PRIMARY, anchor="la")
    draw_text(d, (card[0] + 40, header_y + 46), "From: landlord@example.com", F_BODY(26), TEXT_SECONDARY, anchor="la")

    line_y = header_y + 110
    d.line([(card[0] + 40, line_y), (card[2] - 40, line_y)], fill=rgba(BORDER, 255), width=2)

    # phase A: incoming reply types in (0 - 0.32)
    type_t = local_t(t, 0.03, 0.30)
    n_chars = int(len(INBOUND_TEXT) * ease_in_out_cubic(type_t))
    shown = INBOUND_TEXT[:n_chars]
    f_body = F_BODY(34)
    draw_text(d, (card[0] + 40, line_y + 50), shown, f_body, TEXT_PRIMARY, anchor="la")
    if 0 < type_t < 1 and int(gt * 3) % 2 == 0:
        tw, _ = text_size(d, shown, f_body)
        d.rectangle([card[0] + 40 + tw + 6, line_y + 55, card[0] + 40 + tw + 12, line_y + 90], fill=rgba(ACCENT, 255))

    # phase B: status ticker + live timer (0.34 - 0.78)
    ticker_t = local_t(t, 0.34, 0.78)
    reply_shown_from = 0.80
    if 0 < ticker_t < 1:
        step_dur = 1.0 / len(STATUS_STEPS)
        idx = min(len(STATUS_STEPS) - 1, int(ticker_t / step_dur))
        label = STATUS_STEPS[idx]
        elapsed_s = ticker_t * 14
        sy = line_y + 130
        spin_a = (gt * 6) % (2 * math.pi)
        sx0, sy0 = card[0] + 60, sy
        d.ellipse([sx0 - 8 + 14 * math.cos(spin_a), sy0 - 8 + 14 * math.sin(spin_a),
                   sx0 + 8 + 14 * math.cos(spin_a), sy0 + 8 + 14 * math.sin(spin_a)], fill=rgba(ACCENT, 255))
        draw_text(d, (card[0] + 100, sy), label, F_MONO(30), TEXT_SECONDARY, anchor="lm")
        draw_text(d, (card[2] - 40, sy), f"{elapsed_s:0.0f}s", F_MONO_BOLD(32), LEDGER, anchor="rm")

    # phase C: our reply appears + "Sent in 14s" badge
    reply_t = local_t(t, reply_shown_from, 0.95)
    if reply_t > 0:
        e = ease_out_cubic(reply_t)
        reply_text = "Sounds great - let's lock that in at Rs 7,54,925/month."
        ry = line_y + 130
        n2 = max(1, int(len(reply_text) * min(1, reply_t * 2.2)))
        draw_text(d, (card[0] + 40, ry), reply_text[:n2], F_BODY(30), rgba(ACCENT, int(255 * e)), anchor="lm")

        badge_t = local_t(t, 0.85, 1.0)
        if badge_t > 0:
            be = ease_out_back(badge_t)
            bw, bh = 260 * max(be, 0.06), 66
            bx, by = card[2] - 40 - bw, card[3] - 80
            rounded_rect(d, [bx, by, bx + bw, by + bh], 14, fill=rgba(ACCENT_DIM, 255), outline=rgba(ACCENT, 255), width=2)
            if be > 0.55:
                draw_text(d, (bx + bw / 2, by + bh / 2), "Sent in 14s", F_BODY_BOLD(26), ACCENT, anchor="mm")


# ---------------------------------------------------------------------------
# Scene: negotiation transcript building (35 - 41s)
# ---------------------------------------------------------------------------
TRANSCRIPT_ROWS = [
    ("OUTREACH_SENT", INFO, "Opened at Rs 7,54,850/month"),
    ("REPLY_RECEIVED", LEDGER, '"At last my price would be Rs 8,00,000"'),
    ("INTENT_CLASSIFIED", ACCENT, "tone: agreement -> price mismatch -> counter_offer"),
    ("DECISION_MADE", INFO, "Holding firm, countered at Rs 7,54,925"),
    ("DEAL_WON", ACCENT, "Closed 7.5% under asking, inside budget"),
]

@scene(35.0, 41.0)
def s_transcript(layer, d, t, gt):
    draw_text(d, (W // 2, H // 2 - 380), "Every decision, logged live", F_DISPLAY_BOLD(46), TEXT_PRIMARY, anchor="ma")

    card = [W // 2 - 660, H // 2 - 280, W // 2 + 660, H // 2 + 320]
    rounded_rect(d, card, 20, fill=rgba(SURFACE, 255), outline=rgba(BORDER, 255), width=2)

    row_h = 108
    top = card[1] + 30
    for i, (kind, color, body) in enumerate(TRANSCRIPT_ROWS):
        item_start = 0.06 + i * 0.17
        it = local_t(t, item_start, item_start + 0.3)
        if it <= 0:
            continue
        e = ease_out_cubic(it)
        y = top + i * row_h + (1 - e) * 16
        alpha = int(255 * e)
        d.ellipse([card[0] + 36, y + 6, card[0] + 46, y + 16], fill=rgba(color, alpha))
        draw_text(d, (card[0] + 60, y), kind, F_MONO_BOLD(20), rgba(color, alpha), anchor="lm")
        draw_text(d, (card[0] + 60, y + 34), body, F_BODY(24), rgba(TEXT_PRIMARY, alpha), anchor="lm")
        if i < len(TRANSCRIPT_ROWS) - 1:
            d.line([(card[0] + 36, y + 70), (card[2] - 36, y + 70)], fill=rgba(BORDER, int(alpha * 0.6)), width=1)


# ---------------------------------------------------------------------------
# Scene: guardrails visual (41 - 46s)
# ---------------------------------------------------------------------------
@scene(41.0, 46.0)
def s_guardrails(layer, d, t, gt):
    draw_text(d, (W // 2, H // 2 - 300), "The AI can push hard.", F_DISPLAY_BOLD(50), TEXT_PRIMARY, anchor="ma")
    a2 = ease_out_cubic(local_t(t, 0.15, 0.4))
    draw_text(d, (W // 2, H // 2 - 230), "It can never break the wall.", F_DISPLAY_BOLD(50), rgba(DANGER, int(255 * a2)), anchor="ma")

    bar_x0, bar_x1 = W // 2 - 420, W // 2 + 420
    bar_y = H // 2 + 60
    ceiling_x = bar_x0 + (bar_x1 - bar_x0) * 0.82
    floor_x = bar_x0 + (bar_x1 - bar_x0) * 0.35

    reveal = ease_out_cubic(local_t(t, 0.35, 0.6))
    if reveal > 0:
        d.line([(bar_x0, bar_y), (bar_x0 + (bar_x1 - bar_x0) * reveal, bar_y)], fill=rgba(BORDER, 255), width=8)

    if reveal > 0.3:
        d.line([(ceiling_x, bar_y - 50), (ceiling_x, bar_y + 50)], fill=rgba(DANGER, 255), width=5)
        draw_text(d, (ceiling_x, bar_y - 70), "Budget ceiling", F_BODY(22), DANGER, anchor="mb")
        d.line([(floor_x, bar_y - 40), (floor_x, bar_y + 40)], fill=rgba(WARN, 255), width=5)
        draw_text(d, (floor_x, bar_y - 60), "Sanity floor", F_BODY(22), WARN, anchor="mb")

    # a marker that oscillates between floor and ceiling, never crossing
    if reveal >= 1:
        osc = (math.sin(gt * 2.2) + 1) / 2
        mx = floor_x + (ceiling_x - floor_x) * osc
        d.ellipse([mx - 14, bar_y - 14, mx + 14, bar_y + 14], fill=rgba(ACCENT, 255))

    a3 = ease_out_cubic(local_t(t, 0.75, 1.0))
    draw_text(d, (W // 2, bar_y + 130), "Deterministic rules the learned models can never override.", F_BODY(30), rgba(TEXT_SECONDARY, int(255 * a3)), anchor="ma")


# ---------------------------------------------------------------------------
# Scene: savings result stat (46 - 50s)
# ---------------------------------------------------------------------------
@scene(46.0, 50.0)
def s_savings(layer, d, t, gt):
    a = ease_out_cubic(local_t(t, 0.0, 0.3))
    draw_text(d, (W // 2, H // 2 - 160), "A real number, from a real negotiation", F_BODY(32), rgba(TEXT_SECONDARY, int(255 * a)), anchor="ma")

    count_t = ease_out_cubic(local_t(t, 0.15, 0.7))
    value = int(754925 * count_t)
    txt = f"Rs {inr(value)}"
    f_big = F_DISPLAY_BOLD(110)
    draw_text(d, (W // 2, H // 2 - 30), txt, f_big, ACCENT, anchor="mm")
    draw_text(d, (W // 2, H // 2 + 70), "/month - 7.5% under asking", F_BODY(34), TEXT_SECONDARY, anchor="ma")


# ---------------------------------------------------------------------------
# Scene: aggregate impact stats (50 - 54s)
# ---------------------------------------------------------------------------
IMPACT_STATS = [
    ("26", "deals run"),
    ("13", "deals WON"),
    ("Rs 37.0L", "negotiated off asking"),
    ("23", "companies served"),
]

@scene(50.0, 54.0)
def s_impact(layer, d, t, gt):
    draw_text(d, (W // 2, H // 2 - 260), "Real production numbers", F_DISPLAY_BOLD(44), TEXT_PRIMARY, anchor="ma")
    n = len(IMPACT_STATS)
    col_w = 380
    total_w = col_w * n
    x0 = W // 2 - total_w // 2
    for i, (num, label) in enumerate(IMPACT_STATS):
        it = local_t(t, 0.15 + i * 0.12, 0.15 + i * 0.12 + 0.4)
        if it <= 0:
            continue
        e = ease_out_back(it)
        cx = x0 + col_w * i + col_w / 2
        alpha = int(255 * min(1, it))
        draw_text(d, (cx, H // 2 - 30), num, F_MONO_BOLD(int(56 * min(1, e))), rgba(LEDGER, alpha), anchor="mm")
        draw_text(d, (cx, H // 2 + 50), label, F_BODY(24), rgba(TEXT_SECONDARY, alpha), anchor="ma")


# ---------------------------------------------------------------------------
# Scene: learning models differentiator (54 - 59s)
# ---------------------------------------------------------------------------
@scene(54.0, 59.0)
def s_no_llm(layer, d, t, gt):
    a = ease_out_cubic(local_t(t, 0.0, 0.25))
    draw_text(d, (W // 2, H // 2 - 300), "No large language model in the loop.", F_DISPLAY_BOLD(46), rgba(TEXT_PRIMARY, int(255 * a)), anchor="ma")
    a2 = ease_out_cubic(local_t(t, 0.15, 0.4))
    draw_text(d, (W // 2, H // 2 - 240), "Two small models you can actually read.", F_DISPLAY_BOLD(46), rgba(ACCENT, int(255 * a2)), anchor="ma")

    cards = [
        ("Tone classifier", "Reads agreement / decline /\nquestion / statement", INFO),
        ("Concession model", "Learns how much to give up\neach negotiation round", LEDGER),
    ]
    card_w, card_h = 520, 260
    gap = 60
    total_w = card_w * 2 + gap
    x0 = W // 2 - total_w // 2
    y0 = H // 2 - 60
    for i, (title, body, color) in enumerate(cards):
        it = local_t(t, 0.4 + i * 0.2, 0.4 + i * 0.2 + 0.4)
        if it <= 0:
            continue
        e = ease_out_cubic(it)
        cx0 = x0 + i * (card_w + gap)
        y = y0 + (1 - e) * 30
        alpha = int(255 * e)
        box = [cx0, y, cx0 + card_w, y + card_h]
        rounded_rect(d, box, 20, fill=rgba(SURFACE, alpha), outline=rgba(color, alpha), width=2)
        draw_text(d, (cx0 + 40, y + 50), title, F_BODY_BOLD(30), rgba(color, alpha), anchor="lm")
        ty = y + 110
        for line in body.split("\n"):
            draw_text(d, (cx0 + 40, ty), line, F_BODY(24), rgba(TEXT_SECONDARY, alpha), anchor="lm")
            ty += 36


# ---------------------------------------------------------------------------
# Scene: ending / CTA (59 - 66s)
# ---------------------------------------------------------------------------
@scene(59.0, 66.0)
def s_cta(layer, d, t, gt):
    icon_r = 80
    cx, cy = W // 2, H // 2 - 160
    scale_t = ease_out_back(local_t(t, 0.0, 0.4))
    size = icon_r * 2 * scale_t
    if size > 1:
        radial_glow(layer, cx, cy, int(size * 1.4), ACCENT, max_alpha=75)
        paste_logo(layer, cx, cy, size)

    a = ease_out_cubic(local_t(t, 0.3, 0.55))
    draw_text(d, (W // 2, cy + icon_r + 60), "Find your next office with Roost AI", F_DISPLAY_BOLD(52), rgba(TEXT_PRIMARY, int(255 * a)), anchor="ma")

    btn_t = local_t(t, 0.55, 0.8)
    if btn_t > 0:
        e = ease_out_back(btn_t)
        bw, bh = 320 * max(e, 0.05), 78
        bx, by = W // 2 - bw / 2, cy + icon_r + 150
        rounded_rect(d, [bx, by, bx + bw, by + bh], 16, fill=rgba(ACCENT, int(255 * min(1, e))))
        if e > 0.6:
            draw_text(d, (bx + bw / 2, by + bh / 2), "Get Started", F_BODY_BOLD(30), (6, 33, 15), anchor="mm")

    a3 = ease_out_cubic(local_t(t, 0.8, 1.0))
    draw_text(d, (W // 2, cy + icon_r + 280), "roost-web-lemon.vercel.app", F_MONO(26), rgba(TEXT_SECONDARY, int(255 * a3)), anchor="ma")


if __name__ == "__main__":
    import sys as _sys
    dur = TOTAL_DURATION
    if "--test" in _sys.argv:
        dur = 12.0
    out_name = "roost_promo.mp4"
    render(dur, Path(__file__).parent / out_name)
