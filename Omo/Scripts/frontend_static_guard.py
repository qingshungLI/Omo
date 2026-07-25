#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Omo iOS frontend static guard.

Runs on Linux with the Python standard library only. It performs static /
structural checks on the SwiftUI frontend; Swift is NOT compiled here.

Usage: python3 Omo/Scripts/frontend_static_guard.py [repo_root]
Exit code 0 = all checks passed, 1 = at least one violation.
"""
import json
import os
import re
import struct
import subprocess
import sys

# The published history ends on the UI-lane commit. Default to its parent;
# CI and reviewers can widen the scope explicitly when needed.
BASELINE = os.environ.get("OMO_FRONTEND_SCOPE_BASE", "HEAD^")
LEAK_TOKENS = ["omo-pose-sheet", "omo-private-assets", "video-pilot", "delivery-v2"]
MOTION_ATLASES = {
    "OmoMotionRunAtlas": (2304, 2304),
    "OmoMotionRummageAtlas": (2304, 2304),
    "OmoMotionCarryReturnAtlas": (2304, 768),
}
MOTION_POSTERS = {
    "OmoMotionRunPoster": (384, 384),
    "OmoMotionRummagePoster": (384, 384),
    "OmoMotionCarryReturnPoster": (384, 384),
}
EXPECTED_RECALL_STATES = [
    "idle", "reacting", "turning", "rummaging", "carrying",
    "watching", "acknowledging", "thinking", "sleeping", "farewell",
]
EXPECTED_POSES = [
    "shy", "heart", "approve", "confused", "dejected",
    "dazed", "stretch", "run", "farewell", "smirk",
]
ALLOWED_IMPORTS = {
    "SwiftUI", "UIKit", "Foundation", "Pow", "PhotosUI", "Combine",
    "UserNotifications", "XCTest", "Photos", "StoreKit", "WebKit",
    "CoreData", "CoreGraphics", "QuartzCore", "AVFoundation",
    "AuthenticationServices", "Security", "Omo",
}
FORBIDDEN_TOKENS = ["Lottie", "Rive", "概率", "保底", "必中"]
ALLOWED_SCOPE_FILES = {
    "README.md",
    "docs/asset-provenance.md",
    "docs/ios-api-data-contract-zh.md",
    "tools/cached-ui-fixture-guard.mjs",
}

failures = []
checks = 0


def report(ok, name, detail=""):
    global checks
    checks += 1
    tag = "PASS" if ok else "FAIL"
    line = "[{}] {}".format(tag, name)
    if detail and not ok:
        line += " -- " + detail
    print(line)
    if not ok:
        failures.append(name)


def read(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def git(repo, *args):
    return subprocess.run(
        ["git", "-C", repo] + list(args),
        check=True, capture_output=True, text=True,
    ).stdout


def code_only(source):
    """Blank comments and string literal contents (single-pass scanner).
    Handles //, /* */ nesting, "...", triple-quoted strings, #"..."# raw
    strings, and \\( ... ) interpolation. Newlines are preserved so line
    numbers still line up with the original file."""
    out = []
    i, n = 0, len(source)
    stack = []  # ("string"|"mlstring", interp_paren_depth)
    mode = "code"
    block_depth = 0
    while i < n:
        c = source[i]
        if mode == "line_comment":
            if c == "\n":
                mode = "code"
                out.append("\n")
            i += 1
            continue
        if mode == "block_comment":
            if source.startswith("/*", i):
                block_depth += 1
                i += 2
                continue
            if source.startswith("*/", i):
                block_depth -= 1
                i += 2
                if block_depth == 0:
                    mode = "code"
                continue
            if c == "\n":
                out.append("\n")
            i += 1
            continue
        if mode in ("string", "mlstring"):
            if c == "\\" and i + 1 < n:
                if source[i + 1] == "(":
                    stack.append((mode, 0))
                    mode = "code"
                    out.append("(")
                    i += 2
                    continue
                i += 2
                continue
            if mode == "string" and c == '"':
                mode = "code"
                out.append(" ")
                i += 1
                continue
            if mode == "mlstring" and source.startswith('"""', i):
                mode = "code"
                out.append(" ")
                i += 3
                continue
            if c == "\n":
                out.append("\n")
            i += 1
            continue
        # code mode
        if source.startswith("//", i):
            mode = "line_comment"
            i += 2
            continue
        if source.startswith("/*", i):
            mode = "block_comment"
            block_depth = 1
            i += 2
            continue
        if source.startswith('"""', i):
            mode = "mlstring"
            i += 3
            continue
        raw = re.match(r'#+"', source[i:])
        if raw:
            hashes = len(raw.group(0)) - 1
            close = '"' + "#" * hashes
            j = source.find(close, i + hashes + 1)
            if j == -1:
                i = n
                continue
            out.append("\n" * source.count("\n", i, j))
            out.append(" ")
            i = j + len(close)
            continue
        if c == '"':
            mode = "string"
            i += 1
            continue
        if c == "(" and stack:
            name, depth = stack[-1]
            stack[-1] = (name, depth + 1)
            out.append("(")
            i += 1
            continue
        if c == ")" and stack:
            name, depth = stack[-1]
            out.append(")")
            if depth == 0:
                stack.pop()
                mode = name
            else:
                stack[-1] = (name, depth - 1)
            i += 1
            continue
        out.append(c)
        i += 1
    return "".join(out)


def png_size_rgba(path):
    with open(path, "rb") as f:
        head = f.read(33)
    if head[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    width, height = struct.unpack(">II", head[16:24])
    color_type = head[25]
    return width, height, color_type


def main():
    repo = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")
    swift_root = os.path.join(repo, "Omo")
    screenshot = os.path.join(
        swift_root, "Omo/V2/Screens/Home/V2ScreenshotAwakeningViews.swift")
    awakening = os.path.join(
        swift_root, "Omo/V2/Screens/Home/V2AwakeningViews.swift")
    pose_view = os.path.join(
        swift_root, "Omo/V2/Components/OmoMascotPoseView.swift")
    atlas_player = os.path.join(
        swift_root, "Omo/V2/Components/OmoFrameAtlasPlayer.swift")
    tabs = os.path.join(swift_root, "Omo/V2/Screens/Tabs/V2TabScreens.swift")

    # ---- 1. change scope -------------------------------------------------
    changed = git(repo, "diff", "--name-only", BASELINE).split()
    bad_scope = [
        f for f in changed
        if not f.startswith("Omo/") and f not in ALLOWED_SCOPE_FILES
    ]
    report(
        not bad_scope,
        "scope: only Omo/** or approved public asset docs changed",
        ", ".join(bad_scope),
    )

    # ---- 2. V2RecallMascotState raw values unchanged ---------------------
    src_awake = read(awakening)
    m = re.search(
        r"enum V2RecallMascotState: String, Codable, CaseIterable \{(.*?)\}",
        src_awake, re.S)
    states = re.findall(r"case (\w+)", m.group(1)) if m else []
    report(states == EXPECTED_RECALL_STATES,
           "V2RecallMascotState raw values unchanged", str(states))

    # ---- 3. OmoMascotPose catalog + no persistence -----------------------
    src_pose = read(pose_view)
    m = re.search(r"enum OmoMascotPose: String, CaseIterable \{(.*?)var assetName",
                  src_pose, re.S)
    poses = re.findall(r"case (\w+)", m.group(1)) if m else []
    report(poses == EXPECTED_POSES, "OmoMascotPose catalog", str(poses))
    all_swift = []
    for root, _, files in os.walk(swift_root):
        for f in files:
            if f.endswith(".swift"):
                all_swift.append(os.path.join(root, f))
    pose_persist = []
    storage_keys_now = set()
    for path in all_swift:
        text = read(path)
        for line in text.splitlines():
            if "OmoMascotPose" in line and ("@AppStorage" in line or "UserDefaults" in line):
                pose_persist.append("{}: {}".format(path, line.strip()))
        storage_keys_now.update(re.findall(r'@AppStorage\("([^"]+)"\)', text))
    report(not pose_persist, "OmoMascotPose never persisted",
           "; ".join(pose_persist))

    base_keys = set()
    for path in all_swift:
        rel = os.path.relpath(path, repo)
        try:
            base_text = git(repo, "show", "{}:{}".format(BASELINE, rel))
        except subprocess.CalledProcessError:
            continue
        base_keys.update(re.findall(r'@AppStorage\("([^"]+)"\)', base_text))
    report(storage_keys_now == base_keys,
           "AppStorage key set unchanged",
           "added={} removed={}".format(
               sorted(storage_keys_now - base_keys),
               sorted(base_keys - storage_keys_now)))

    # ---- 4. imports ------------------------------------------------------
    imports = set()
    for path in all_swift:
        imports.update(re.findall(r"^import (\w+)", read(path), re.M))
        imports.update(re.findall(r"^@testable import (\w+)", read(path), re.M))
    bad_imports = imports - ALLOWED_IMPORTS
    report(not bad_imports, "no new/unknown imports", str(sorted(bad_imports)))

    # ---- 5. forbidden tokens ---------------------------------------------
    hits = []
    for path in all_swift:
        text = read(path)
        for token in FORBIDDEN_TOKENS:
            if token in text:
                hits.append("{}:{}".format(os.path.basename(path), token))
    report(not hits, "no Lottie/Rive/probability-pity tokens", ", ".join(hits))

    # ---- 6. private asset source must not leak ---------------------------
    leaks = []
    leak_files = list(all_swift)
    for root, _, files in os.walk(os.path.join(assets_dir(swift_root))):
        for f in files:
            if f == "Contents.json":
                leak_files.append(os.path.join(root, f))
    for p in leak_files:
        try:
            text = read(p)
        except (UnicodeDecodeError, IsADirectoryError):
            continue
        if any(t in text for t in LEAK_TOKENS):
            leaks.append(p)
    report(not leaks, "private asset path not referenced", ", ".join(leaks))

    # ---- 7. derived imagesets --------------------------------------------
    assets = assets_dir(swift_root)
    for pose in EXPECTED_POSES:
        cap = pose.capitalize()
        d = os.path.join(assets, "OmoPose{}.imageset".format(cap))
        ok = os.path.isdir(d)
        detail = ""
        if ok:
            cj = os.path.join(d, "Contents.json")
            try:
                data = json.loads(read(cj))
                fnames = [img["filename"] for img in data["images"]]
                ok = len(fnames) == 1
                if ok:
                    png = os.path.join(d, fnames[0])
                    meta = png_size_rgba(png) if os.path.isfile(png) else None
                    ok = (meta is not None and meta[0] == 512
                          and meta[1] == 512 and meta[2] == 6)
                    detail = "png meta={}".format(meta)
            except (json.JSONDecodeError, KeyError, OSError) as exc:
                ok = False
                detail = str(exc)
        report(ok, "imageset OmoPose{} (512x512 RGBA)".format(cap), detail)

    for pose in EXPECTED_POSES:
        cap = pose.capitalize()
        token = 'case .{}: "OmoPose{}"'.format(pose, cap)
        report(token in src_pose, "assetName mapping {}".format(pose))

    # ---- 7b. motion atlases -----------------------------------------------
    src_shot = read(screenshot)
    for name, (ew, eh) in MOTION_ATLASES.items():
        d = os.path.join(assets, "{}.imageset".format(name))
        ok = os.path.isdir(d)
        detail = ""
        if ok:
            try:
                data = json.loads(read(os.path.join(d, "Contents.json")))
                fnames = [img["filename"] for img in data["images"]]
                ok = len(fnames) == 1
                if ok:
                    png = os.path.join(d, fnames[0])
                    meta = png_size_rgba(png) if os.path.isfile(png) else None
                    ok = (meta is not None and meta[0] == ew
                          and meta[1] == eh and meta[2] == 6)
                    detail = "png meta={}".format(meta)
            except (json.JSONDecodeError, KeyError, OSError) as exc:
                ok = False
                detail = str(exc)
        report(ok, "atlas {} ({}x{} RGBA)".format(name, ew, eh), detail)

    for name, (ew, eh) in MOTION_POSTERS.items():
        d = os.path.join(assets, "{}.imageset".format(name))
        ok = os.path.isdir(d)
        detail = ""
        if ok:
            try:
                data = json.loads(read(os.path.join(d, "Contents.json")))
                fnames = [img["filename"] for img in data["images"]]
                ok = len(fnames) == 1
                if ok:
                    png = os.path.join(d, fnames[0])
                    meta = png_size_rgba(png) if os.path.isfile(png) else None
                    ok = (meta is not None and meta[0] == ew
                          and meta[1] == eh and meta[2] == 6)
                    detail = "png meta={}".format(meta)
            except (json.JSONDecodeError, KeyError, OSError) as exc:
                ok = False
                detail = str(exc)
        report(ok, "poster {} ({}x{} RGBA)".format(name, ew, eh), detail)

    m = re.search(r"private var summonMascotView: some View \{(.*?)\n    \}",
                  src_shot, re.S)
    summon_body = m.group(1) if m else ""
    def atlas_case(stage):
        m2 = re.search(
            stage
            + r":\s*\n\s*OmoFrameAtlasPlayer\(\s*\n\s*assetName: \"([^\"]+)\","
            + r"\s*\n\s*posterAssetName: \"([^\"]+)\","
            + r"\s*\n\s*columns: (\d+), rows: (\d+), frameCount: (\d+), fps: (\d+), loop: (\w+)",
            summon_body)
        return m2.groups() if m2 else None
    report(atlas_case(r"case \.turn, \.approach")
           == ("OmoMotionRunAtlas", "OmoMotionRunPoster",
               "6", "6", "32", "24", "true"),
           "summon turn/approach -> run atlas 6x6/32f/24fps/loop")
    report(atlas_case(r"case \.rummage")
           == ("OmoMotionRummageAtlas", "OmoMotionRummagePoster",
               "6", "6", "32", "24", "true"),
           "summon rummage -> rummage atlas 6x6/32f/24fps/loop")
    report(atlas_case(r"case \.carrying, \.orbit")
           == ("OmoMotionCarryReturnAtlas", "OmoMotionCarryReturnPoster",
               "6", "2", "10", "24", "false"),
           "summon carrying/orbit -> carry-return atlas 6x2/10f/24fps/once")
    report("OmoMascotPoseView(pose: .approve" in summon_body,
           "summon settle/cue keeps derived approve pose")
    report("case .turn, .approach, .rummage, .carrying, .orbit: false" in src_shot
           and "case .settle, .cue: true" in src_shot,
           "text card 100% opaque only at settle/cue (atlas carries blank card)")

    src_player = read(atlas_player)
    task_body = re.search(
        r"\.task\(id: playbackDescriptor\) \{(.*?)\n        \}",
        src_player, re.S)
    rm_before_load = bool(
        task_body
        and "guard !reduceMotion else { return }" in task_body.group(1)
        and "OmoFrameAtlasStore.shared.frames(" in task_body.group(1)
        and task_body.group(1).index("guard !reduceMotion else { return }")
        < task_body.group(1).index("OmoFrameAtlasStore.shared.frames(")
    )
    report(rm_before_load, "Reduce Motion avoids atlas decoding")
    report("Image(posterAssetName)" in src_player
           and "Color.clear" not in src_player,
           "loading/failure path renders standalone poster")

    # ---- 8. behavior constants -------------------------------------------
    src_shot = read(screenshot)
    report("brushDiameter: CGFloat = 26" in src_shot,
           "scratch brush stays 26pt")
    report(src_shot.count("coverage >= 0.45") >= 2,
           "scratch auto-reveal stays at 45%")
    m = re.search(
        r"let timings: \[UInt64\] = currentIndex == 0\s*\n\s*\? \[([^\]]+)\]\s*\n\s*: \[([^\]]+)\]",
        src_shot)
    if m:
        def total(group):
            return sum(int(x.replace("_", "")) for x in m.group(group).split(","))
        report(total(1) == 1_800_000_000, "first summon totals 1800ms",
               str(total(1)))
        report(total(2) == 900_000_000, "later summon totals 900ms",
               str(total(2)))
    else:
        report(False, "summon timing arrays found")
    report("try? await Task.sleep(nanoseconds: 180_000_000)" in src_shot,
           "reduce-motion summon <= 180ms")
    report("6_500_000_000" in src_shot and "460_000_000" in src_shot,
           "companion confused-once timing (6.5s/460ms)")
    report("320_000_000" in src_shot and "V2RevealYarnDebrisView" in src_shot,
           "320ms yarn debris present")
    report("summonStage == .settle || summonStage == .cue" in src_shot,
           "rarity only appears on card settle")
    rarity_src = read(os.path.join(
        swift_root, "Omo/V2/Components/Cards/V2RarityPresentation.swift"))
    report("知识核心潜力" in rarity_src,
           "rarity a11y label keeps core-potential wording")

    # ---- 9. copy ----------------------------------------------------------
    for token in ["没想起", "想偏了", "想对了"]:
        report(token in src_shot, "assessment copy {}".format(token))
    for token in ['assessmentButton("记得"', 'assessmentButton("模糊"',
                  'assessmentButton("忘记"']:
        report(token not in src_shot,
               "old assessment copy removed {}".format(token))
    src_tabs = read(tabs)
    for token in ["编辑后确认", "仅存档", "删除"]:
        report(token in src_tabs, "confirmation copy {}".format(token))
    report("v2.assessment." in src_shot, "assessment a11y identifiers kept")

    # ---- 10. home idle ----------------------------------------------------
    report("UInt64.random(in: 8_000_000_000...14_000_000_000)" in src_awake,
           "home idle interval 8-14s")
    report("[.shy, .heart, .approve, .smirk]" in src_awake,
           "tap greeting sequence shy->heart->approve->smirk")
    report("homeMascotPose = stretchTurn ? .stretch : .smirk" in src_awake,
           "idle rotates only stretch/smirk")
    report("isLowPowerModeEnabled" in src_awake and "homeMascotHold" in src_awake,
           "idle stops on interaction/low-power")
    report("OmoMascotPoseView(pose: homeMascotPose" in src_awake,
           "home mascot uses derived poses")

    # ---- 11. opacity discipline --------------------------------------------
    offenders = []
    for path in all_swift:
        for lineno, line in enumerate(read(path).splitlines(), 1):
            if ".fill(V2Color.surfaceCream.opacity(" in line:
                offenders.append("{}:{}".format(os.path.basename(path), lineno))
    # decorative back cards in the summon/archive transitions are allowed
    bad = [b for b in offenders
           if not b.startswith("V2ScreenshotAwakeningViews.swift")]
    report(not bad, "text cards stay opaque (surfaceCream.opacity only decorative)",
           ", ".join(bad))

    # ---- 12. brace balance --------------------------------------------------
    for path in sorted(all_swift):
        code = code_only(read(path))
        balance = code.count("{") - code.count("}")
        report(balance == 0,
               "braces balanced {}".format(os.path.relpath(path, repo)),
               "delta={}".format(balance))

    print("\n{}/{} checks passed".format(checks - len(failures), checks))
    if failures:
        print("FAILURES: " + ", ".join(failures))
        return 1
    return 0


def assets_dir(swift_root):
    return os.path.join(swift_root, "Omo/Assets.xcassets")


if __name__ == "__main__":
    sys.exit(main())
