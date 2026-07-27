#!/usr/bin/env python3
"""Build a clean printable PDF of Callie's macro recipes."""
from __future__ import annotations

import json
from collections import OrderedDict
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    HRFlowable,
)

pdfmetrics.registerFont(TTFont("DejaVu", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DejaVu-Bold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("DejaVuSerif", "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"))
pdfmetrics.registerFont(TTFont("DejaVuSerif-Bold", "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"))

INK = colors.HexColor("#2C2420")
MUTED = colors.HexColor("#6B5E56")
RULE = colors.HexColor("#D9CFC6")
ACCENT = colors.HexColor("#8B4518")  # warm brown — not purple/terracotta AI defaults
SOFT = colors.HexColor("#F7F3EE")
WHITE = colors.white

CAT_ORDER = ["Breakfast", "Lunch", "Dinner", "Snack"]


def esc(text: str) -> str:
    return (
        str(text or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def styles():
    base = getSampleStyleSheet()
    return {
        "cover_title": ParagraphStyle(
            "cover_title",
            parent=base["Normal"],
            fontName="DejaVuSerif-Bold",
            fontSize=32,
            leading=38,
            textColor=INK,
            alignment=TA_CENTER,
            spaceAfter=10,
        ),
        "cover_sub": ParagraphStyle(
            "cover_sub",
            parent=base["Normal"],
            fontName="DejaVu",
            fontSize=12,
            leading=16,
            textColor=MUTED,
            alignment=TA_CENTER,
            spaceAfter=6,
        ),
        "section": ParagraphStyle(
            "section",
            parent=base["Normal"],
            fontName="DejaVuSerif-Bold",
            fontSize=20,
            leading=24,
            textColor=INK,
            spaceBefore=6,
            spaceAfter=10,
        ),
        "recipe": ParagraphStyle(
            "recipe",
            parent=base["Normal"],
            fontName="DejaVuSerif-Bold",
            fontSize=14,
            leading=18,
            textColor=INK,
            spaceBefore=4,
            spaceAfter=4,
        ),
        "meta": ParagraphStyle(
            "meta",
            parent=base["Normal"],
            fontName="DejaVu",
            fontSize=9,
            leading=12,
            textColor=MUTED,
            spaceAfter=6,
        ),
        "label": ParagraphStyle(
            "label",
            parent=base["Normal"],
            fontName="DejaVu-Bold",
            fontSize=9,
            leading=12,
            textColor=ACCENT,
            spaceBefore=6,
            spaceAfter=3,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["Normal"],
            fontName="DejaVu",
            fontSize=9.5,
            leading=13,
            textColor=INK,
            spaceAfter=2,
        ),
        "toc_cat": ParagraphStyle(
            "toc_cat",
            parent=base["Normal"],
            fontName="DejaVuSerif-Bold",
            fontSize=12,
            leading=16,
            textColor=INK,
            spaceBefore=10,
            spaceAfter=4,
        ),
        "toc_item": ParagraphStyle(
            "toc_item",
            parent=base["Normal"],
            fontName="DejaVu",
            fontSize=10,
            leading=14,
            textColor=INK,
            leftIndent=8,
        ),
        "footer": ParagraphStyle(
            "footer",
            parent=base["Normal"],
            fontName="DejaVu",
            fontSize=8,
            textColor=MUTED,
            alignment=TA_CENTER,
        ),
    }


def macro_chip(recipe, s):
    serves = recipe.get("serves") or 1
    serve_txt = "1 serving" if serves == 1 else f"{serves} servings (macros are per serving)"
    return Paragraph(
        f"<b>{recipe['cal']}</b> cal  ·  "
        f"<b>{recipe['p']}g</b> protein  ·  "
        f"<b>{recipe['c']}g</b> carbs  ·  "
        f"<b>{recipe['f']}g</b> fat"
        f"&nbsp;&nbsp;&nbsp;—&nbsp;&nbsp;&nbsp;{serve_txt}",
        s["meta"],
    )


def ingredient_lines(lines, s):
    if not lines:
        return []
    items = []
    for line in lines:
        amount = str(line.get("amount") or "").strip()
        item = str(line.get("item") or "").strip()
        text = f"<b>{esc(amount)}</b> — {esc(item)}" if amount else esc(item)
        items.append(ListItem(Paragraph(text, s["body"]), leftIndent=8, bulletColor=MUTED))
    return [ListFlowable(items, bulletType="bullet", start="•", leftIndent=12, bulletFontSize=8)]


def step_lines(steps, s):
    if not steps:
        return []
    items = []
    for i, step in enumerate(steps, 1):
        items.append(
            ListItem(Paragraph(esc(step), s["body"]), leftIndent=8, value=i, bulletColor=MUTED)
        )
    return [ListFlowable(items, bulletType="1", leftIndent=14, bulletFontSize=9)]


def recipe_block(recipe, s):
    detail = recipe.get("detail") or {}
    bits = [
        Paragraph(esc(recipe["name"]), s["recipe"]),
        macro_chip(recipe, s),
        HRFlowable(width="100%", thickness=0.5, color=RULE, spaceBefore=0, spaceAfter=6),
    ]

    # short blurb from the bank desc
    if recipe.get("desc"):
        bits.append(Paragraph(esc(recipe["desc"]), s["body"]))
        bits.append(Spacer(1, 4))

    serving = detail.get("serving")
    batch = detail.get("batch")
    steps = detail.get("steps")

    if batch:
        bits.append(Paragraph("BATCH (cook once, plate multiple)", s["label"]))
        bits.extend(ingredient_lines(batch, s))

    if serving:
        bits.append(Paragraph("PER SERVING (matches the macros above)", s["label"]))
        bits.extend(ingredient_lines(serving, s))

    if steps:
        bits.append(Paragraph("STEPS", s["label"]))
        bits.extend(step_lines(steps, s))

    bits.append(Spacer(1, 14))
    return KeepTogether(bits)


def build(recipes, out_path: Path):
    s = styles()
    by_cat = OrderedDict((c, []) for c in CAT_ORDER)
    for r in recipes:
        by_cat.setdefault(r["cat"], []).append(r)

    doc = SimpleDocTemplate(
        str(out_path),
        pagesize=letter,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        topMargin=0.7 * inch,
        bottomMargin=0.7 * inch,
        title="Callie's Macro Recipes",
        author="Callie",
    )

    story = []

    # Cover
    story.append(Spacer(1, 2.2 * inch))
    story.append(Paragraph("Callie's Macro Recipes", s["cover_title"]))
    story.append(Spacer(1, 0.15 * inch))
    story.append(HRFlowable(width="40%", thickness=1, color=ACCENT, spaceBefore=4, spaceAfter=12))
    story.append(
        Paragraph(
            f"{len(recipes)} high-protein recipes with exact quantities and macros counted.",
            s["cover_sub"],
        )
    )
    story.append(Paragraph("Breakfast · Lunch · Dinner · Snacks", s["cover_sub"]))
    story.append(Spacer(1, 0.5 * inch))
    story.append(
        Paragraph(
            "Macros shown are per serving. Batch recipes list full cook amounts, then the plated serving that matches those macros.",
            s["cover_sub"],
        )
    )
    story.append(PageBreak())

    # Contents
    story.append(Paragraph("Contents", s["section"]))
    story.append(HRFlowable(width="100%", thickness=0.8, color=ACCENT, spaceBefore=0, spaceAfter=8))
    n = 1
    for cat, items in by_cat.items():
        if not items:
            continue
        story.append(Paragraph(cat, s["toc_cat"]))
        for r in items:
            story.append(
                Paragraph(
                    f"{n}. {esc(r['name'])} — {r['cal']} cal · {r['p']}p / {r['c']}c / {r['f']}f",
                    s["toc_item"],
                )
            )
            n += 1
    story.append(PageBreak())

    # Recipes by category
    first = True
    for cat, items in by_cat.items():
        if not items:
            continue
        if not first:
            story.append(PageBreak())
        first = False
        story.append(Paragraph(cat, s["section"]))
        story.append(HRFlowable(width="100%", thickness=0.8, color=ACCENT, spaceBefore=0, spaceAfter=10))
        for r in items:
            story.append(recipe_block(r, s))

    def on_page(canvas, doc_):
        canvas.saveState()
        canvas.setStrokeColor(RULE)
        canvas.setLineWidth(0.5)
        canvas.line(0.75 * inch, 0.5 * inch, letter[0] - 0.75 * inch, 0.5 * inch)
        canvas.setFont("DejaVu", 8)
        canvas.setFillColor(MUTED)
        canvas.drawString(0.75 * inch, 0.35 * inch, "Callie's Macro Recipes")
        canvas.drawRightString(letter[0] - 0.75 * inch, 0.35 * inch, f"{doc_.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    return out_path


def main():
    recipes = json.loads(Path("/tmp/recipes.json").read_text())
    out = Path("/opt/cursor/artifacts/Callies-Macro-Recipes.pdf")
    out.parent.mkdir(parents=True, exist_ok=True)
    build(recipes, out)
    # also drop a copy in the repo for the PR
    repo_out = Path("/workspace/public/Callies-Macro-Recipes.pdf")
    build(recipes, repo_out)
    print(f"wrote {out} ({out.stat().st_size} bytes)")
    print(f"wrote {repo_out} ({repo_out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
