#!/usr/bin/env python3
"""
split-fusion-manual.py
======================================================================
Splits the (large) Fusion scripting manual Markdown into one file per
guide section and one file per API class, and (re)builds the manual
index. Output goes to  ../references/fusion-manual/  relative to this
script.

WHERE THE SOURCE MARKDOWN COMES FROM
------------------------------------
Blackmagic ships the manual only as a PDF. You can convert that PDF to
Markdown for free with Mistral's Document AI (OCR):
    https://console.mistral.ai/build/document-ai/ocr-playground
Upload the Fusion scripting PDF, export the Markdown, and pass that
file to this script.

USAGE
-----
    python3 split-fusion-manual.py /path/to/fusion_manual.md

The script is idempotent: it overwrites the generated files in place.

WHY CUT AT THE HEADING (read before editing)
---------------------------------------------
Each class section in the manual looks like:

    ## BezierSpline
    ```txt
    class BezierSpline
    Parent class: Spline
    ```
    ...

The OCR sometimes wraps the `class X` line in a code fence whose
OPENING ``` sits *after* the `## X` heading. If you cut a class section
at the `class X` line you strip the heading and the opening fence onto
the previous class (leaving mismatched backticks). So we cut at the
`## X` heading line instead, which keeps each heading with its own
fenced block. A small post-pass also repairs code blocks whose closing
fence the OCR dropped right before a "Lua/Python usage:" label.
======================================================================
"""
import os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT  = os.path.normpath(os.path.join(HERE, "..", "references", "fusion-manual"))
CLS  = os.path.join(OUT, "classes")

# Canonical class list (order doesn't matter; taken from the manual's contents).
CLASSES = ["BezierSpline","BinClip","BinItem","BinManager","BinStill","ChildFrame","ChildGroup",
"Composition","FloatViewFrame","FlowView","FontList","FuFrame","Fusion","FuView","GL3DViewer",
"GLImageViewer","GLPreview","GLView","GLViewer","Gradient","GraphView","HotkeyManager","Image",
"ImageCacheManager","IOClass","KeyFrameView","Link","List","Loader","MailMessage","MenuManager",
"Object","Operator","Parameter","PlainInput","PlainOutput","PolylineMask","Preview","QueueManager",
"Registry","RenderJob","RenderSlave","ScriptServer","SourceOperator","TimeRegion","TransformMatrix"]

GUIDE = [  # (output filename, start-heading text, end-heading text)
    ("01-introduction.md",          "About this Document",      "Scripting Languages"),
    ("02-scripting-languages.md",   "Scripting Languages",      "Scripting and Debugging"),
    ("03-scripting-and-debugging.md","Scripting and Debugging", "Fusion's Object Model"),
    ("04-object-model.md",          "Fusion's Object Model",    "Graphical User Interfaces"),
    ("05-gui-and-askuser.md",       "Graphical User Interfaces","__CONTENT_REF__"),
]

GUIDE_DESC = {
 "01-introduction.md":"Orientation, conventions, and a quick-start tutorial that builds a first script.",
 "02-scripting-languages.md":"Lua vs Python, installation/setup, libraries, and FusionScript differences.",
 "03-scripting-and-debugging.md":"The Console, script types (Composition/Tool/Bin/Utility/external/commandline), callbacks, InTool scripts, Fuses.",
 "04-object-model.md":"The object hierarchy: Fusion, Composition, Tool/Operator instances, Inputs/Outputs, attributes, ObjectData, metadata.",
 "05-gui-and-askuser.md":"Building simple UIs: the AskUser dialog and the available control types.",
 "06-class-hierarchy.md":"The full Fusion class hierarchy table.",
}

NOISE = {"FUSION SCRIPTING GUIDE AND REFERENCE MANUAL","SCRIPTING REFERENCE","SCRIPTING GUIDE"}
BANNER = ("> **Source:** Converted snapshot of the *Fusion 8 Scripting Guide & Reference "
          "Manual* (PDF -> Markdown). It may be outdated or inaccurate. For the DaVinci "
          "Resolve scripting API the live `ResolveDocs` README is the source of truth; for "
          "real working usage prefer tested code. See `../../SKILL.md`.")

USAGE_RE = re.compile(r'^\s*→?\s*(Lua|Python)\s*usage:\s*$')


def load(path):
    with open(path, encoding="utf-8") as f:
        return f.read().split("\n")


def find_heading(lines, text, after=0):
    rx = re.compile(r'#{1,6}\s+' + re.escape(text) + r'\s*$')
    for i in range(after, len(lines)):
        if rx.fullmatch(lines[i].strip()):
            return i
    return None


def clean(block):
    out, prev_blank = [], False
    for ln in block:
        st = ln.strip()
        if st in NOISE: continue
        if re.fullmatch(r'#?\s*Fusion 8\s*\d*', st): continue
        if re.fullmatch(r'\d{1,3}', st): continue
        blank = (st == "")
        if blank and prev_blank: continue
        out.append(ln); prev_blank = blank
    while out and out[0].strip() == "": out.pop(0)
    while out and out[-1].strip() == "": out.pop()
    return out


def fix_fences(lines):
    """Insert a missing closing fence when a language-tagged opener appears while
    still 'inside' a block (the OCR dropped the closer, usually right before a
    'Lua/Python usage:' label)."""
    changed = 0
    while True:
        inside, open_at, anomaly = False, None, None
        for i, l in enumerate(lines):
            s = l.lstrip()
            if s.startswith("```"):
                tagged = bool(s[3:].strip())
                if inside and tagged:
                    anomaly = (open_at, i); break
                inside = not inside
                open_at = i if inside else open_at
        if not anomaly: break
        oa, ia = anomaly
        ins = next((j for j in range(ia-1, oa, -1) if USAGE_RE.match(lines[j])), ia)
        lines.insert(ins, "```")
        changed += 1
    return changed


def write(path, body, force_title=None):
    body = clean(body)
    parts = [BANNER, ""]
    if force_title and not (body and re.match(r'#{1,6}\s+'+re.escape(force_title)+r'\s*$', body[0].strip())):
        parts += [f"## {force_title}", ""]
    parts += body
    fix_fences(parts)
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(parts).rstrip("\n") + "\n")


def prev_nonblank(lines, i):
    j = i - 1
    while j >= 0 and lines[j].strip() == "":
        j -= 1
    return j


def class_boundary(lines, name, lo, hi):
    """Prefer the `## Name` heading; fall back to the bare-name line above a
    `class Name` definition (some classes have no heading in the OCR output)."""
    h = find_heading(lines, name, lo)
    if h is not None and h < hi:
        return h
    rx = re.compile(r'[#*\s]*class\s+' + re.escape(name) + r'[*\s]*$')
    for i in range(lo, hi):
        if rx.fullmatch(lines[i].strip()):
            t = prev_nonblank(lines, i)
            return t if (t >= lo and lines[t].strip().lstrip('#').strip() == name) else i
    return None


def build_index(class_files):
    STOP = re.compile(r'^(#|>|→|```|!\[|Methods\b|Members?\b)')
    def info(fn):
        lines = load(os.path.join(CLS, fn))
        parent, pidx = None, None
        for i, l in enumerate(lines):
            m = re.match(r'\*{0,2}Parent class:\*{0,2}\s*(.+)', l.strip())
            if m: parent, pidx = m.group(1).replace('**', '').strip(), i; break
        sent = None
        for i in range((pidx + 1) if pidx is not None else 0, len(lines)):
            s = lines[i].strip()
            if not s: continue
            if STOP.match(s): break
            if s.lower().startswith('class '): continue
            if re.match(r'^[A-Za-z0-9_]+\.[A-Za-z0-9_]+', s): break
            if len(s.split()) >= 3 and not s.endswith(':'):
                sent = s.replace('**', '').strip(); break
        return parent, sent
    out = [
        "# Fusion Scripting Manual — Index", "",
        "> **Source & status:** The *Fusion 8 Scripting Guide & Reference Manual*, converted "
        "from PDF to Markdown and split into one file per topic/class for easy searching. It is "
        "a **snapshot and may be outdated or inaccurate**.", "",
        "> **Source of truth:** For the DaVinci Resolve scripting API, the live `ResolveDocs` "
        "README (`../resolve-api.txt`) is authoritative. For proven usage, prefer tested code "
        "over this manual. Use this manual for Fusion-specific scripting concepts (object model, "
        "splines, tools, GUIs) that ResolveDocs does not cover.", "",
        "> **Regenerating:** convert Blackmagic's Fusion scripting PDF to Markdown for free with "
        "[Mistral Document AI](https://console.mistral.ai/build/document-ai/ocr-playground), then "
        "run `python3 scripts/split-fusion-manual.py <converted.md>`.", "",
        "## Guide", "", "Conceptual chapters — read these to learn how Fusion scripting works.", "",
        "| Section | What's in it |", "|---|---|",
    ]
    for fn in [g[0] for g in GUIDE] + ["06-class-hierarchy.md"]:
        out.append(f"| [`{fn}`]({fn}) | {GUIDE_DESC.get(fn,'')} |")
    out += ["", "## Class Reference", "", "One file per Fusion class — open only the class you need.", "",
            "| Class | Summary |", "|---|---|"]
    for name, fn in class_files:
        parent, sent = info(fn)
        d = sent or "—"
        if len(d) > 120: d = d[:117] + "..."
        extra = f" *(extends {parent})*" if parent and parent != "Object" else ""
        out.append(f"| [`{name}`](classes/{fn}){extra} | {d} |")
    out.append("")
    with open(os.path.join(OUT, "00-index.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(out))


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: python3 split-fusion-manual.py /path/to/fusion_manual.md")
    src = sys.argv[1]
    if not os.path.isfile(src):
        sys.exit(f"source not found: {src}")
    lines = load(src)
    os.makedirs(CLS, exist_ok=True)

    # anchors
    i_chier = find_heading(lines, "Class Hierarchy")
    i_gui   = find_heading(lines, "Graphical User Interfaces")
    i_cref  = find_heading(lines, "Content", after=(i_gui + 1) if i_gui else 0)
    i_ref   = find_heading(lines, "Reference", after=i_chier or 0)
    i_sym   = find_heading(lines, "Symbols", after=i_ref or 0)
    if None in (i_chier, i_gui, i_cref, i_ref, i_sym):
        sys.exit("could not locate expected section anchors — is this the Fusion scripting manual?")

    # guide sections
    for name, start_h, end_h in GUIDE:
        a = find_heading(lines, start_h)
        b = i_cref if end_h == "__CONTENT_REF__" else find_heading(lines, end_h)
        write(os.path.join(OUT, name), lines[a:b])
    write(os.path.join(OUT, "06-class-hierarchy.md"), lines[i_chier:i_ref])

    # class reference: cut at the heading (see module docstring)
    starts, missing = {}, []
    for name in CLASSES:
        s = class_boundary(lines, name, i_ref, i_sym)
        (starts.__setitem__(name, s) if s is not None else missing.append(name))
    if missing:
        print("WARNING: no boundary found for:", missing)
    ordered = sorted(starts.items(), key=lambda kv: kv[1])
    slug = lambda n: re.sub(r'[^a-z0-9]+', '-', n.lower()).strip('-')
    class_files = []
    for idx, (name, start) in enumerate(ordered):
        end = ordered[idx + 1][1] if idx + 1 < len(ordered) else i_sym
        fn = slug(name) + ".md"
        write(os.path.join(CLS, fn), lines[start:end], force_title=name)
        class_files.append((name, fn))

    build_index(class_files)

    # report
    odd = []
    for root, _, files in os.walk(OUT):
        for f in files:
            if f.endswith(".md"):
                p = os.path.join(root, f)
                if sum(1 for l in load(p) if l.lstrip().startswith("```")) % 2:
                    odd.append(os.path.relpath(p, OUT))
    print(f"guide sections: {len(GUIDE)+1}")
    print(f"class files:    {len(class_files)}")
    print(f"odd-fence files:{' ' + ', '.join(odd) if odd else ' none'}")


if __name__ == "__main__":
    main()
