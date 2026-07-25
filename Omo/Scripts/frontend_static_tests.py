#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Omo iOS frontend behavioral tests, executable on Linux.

These tests parse the SwiftUI sources and asset catalog statically — Swift is
NOT compiled on Linux; Xcode-side behavior is covered by OmoTests/*.swift.

Usage: python3 Omo/Scripts/frontend_static_tests.py [repo_root]
Exit code 0 = all tests passed.
"""
import os
import re
import subprocess
import sys
import unittest
import zlib

# The published history may end on the latest UI-lane commit. Default to its
# parent; CI and reviewers can widen the scope explicitly when needed.
BASELINE = os.environ.get("OMO_FRONTEND_SCOPE_BASE", "HEAD^")
EXPECTED_POSES = [
    "shy", "heart", "approve", "confused", "dejected",
    "dazed", "stretch", "run", "farewell", "smirk",
]

REPO = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")


def read(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def repo_path(*parts):
    return os.path.join(REPO, *parts)


def git(*args):
    return subprocess.run(
        ["git", "-C", REPO] + list(args),
        check=True, capture_output=True, text=True,
    ).stdout


def png_alpha_stats(path):
    """Return (transparent_fraction, opaque_fraction) for an 8-bit RGBA PNG."""
    try:
        from PIL import Image  # noqa: PLC0415 - optional fast path
        im = Image.open(path).convert("RGBA")
        alphas = list(im.getdata(band=3))
    except ImportError:
        alphas = _decode_png_alpha(path)
    total = len(alphas)
    transparent = sum(1 for a in alphas if a < 16) / total
    opaque = sum(1 for a in alphas if a > 240) / total
    return transparent, opaque


def _decode_png_alpha(path):
    with open(path, "rb") as f:
        data = f.read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "not a png"
    pos = 8
    idat = b""
    width = height = bit_depth = color_type = None
    while pos < len(data):
        length = int.from_bytes(data[pos:pos + 4], "big")
        ctype = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + length]
        if ctype == b"IHDR":
            width = int.from_bytes(chunk[0:4], "big")
            height = int.from_bytes(chunk[4:8], "big")
            bit_depth = chunk[8]
            color_type = chunk[9]
        elif ctype == b"IDAT":
            idat += chunk
        pos += 12 + length
    assert color_type == 6 and bit_depth == 8, "expected 8-bit RGBA png"
    raw = zlib.decompress(idat)
    stride = width * 4
    prev = bytearray(stride)
    alphas = bytearray()
    p = 0
    for _ in range(height):
        filt = raw[p]
        p += 1
        line = bytearray(raw[p:p + stride])
        p += stride
        if filt == 1:
            for x in range(4, stride):
                line[x] = (line[x] + line[x - 4]) & 0xFF
        elif filt == 2:
            for x in range(stride):
                line[x] = (line[x] + prev[x]) & 0xFF
        elif filt == 3:
            for x in range(stride):
                a = line[x - 4] if x >= 4 else 0
                line[x] = (line[x] + ((a + prev[x]) >> 1)) & 0xFF
        elif filt == 4:
            for x in range(stride):
                a = line[x - 4] if x >= 4 else 0
                b = prev[x]
                c = prev[x - 4] if x >= 4 else 0
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x] + pr) & 0xFF
        alphas += line[3::4]
        prev = line
    return alphas


class TestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.shot = read(repo_path(
            "Omo/Omo/V2/Screens/Home/V2ScreenshotAwakeningViews.swift"))
        cls.awake = read(repo_path(
            "Omo/Omo/V2/Screens/Home/V2AwakeningViews.swift"))
        cls.pose = read(repo_path(
            "Omo/Omo/V2/Components/OmoMascotPoseView.swift"))
        cls.tabs = read(repo_path("Omo/Omo/V2/Screens/Tabs/V2TabScreens.swift"))


class TestDerivedAssets(TestCase):
    def test_pose_enum_catalog_order(self):
        m = re.search(r"enum OmoMascotPose: String, CaseIterable \{(.*?)var assetName",
                      self.pose, re.S)
        self.assertIsNotNone(m)
        self.assertEqual(re.findall(r"case (\w+)", m.group(1)), EXPECTED_POSES)

    def test_asset_name_mapping(self):
        for pose in EXPECTED_POSES:
            cap = pose.capitalize()
            self.assertIn('case .{}: "OmoPose{}"'.format(pose, cap), self.pose)

    def test_imagesets_complete_and_png_meta(self):
        for pose in EXPECTED_POSES:
            cap = pose.capitalize()
            d = repo_path("Omo/Omo/Assets.xcassets/OmoPose{}.imageset".format(cap))
            self.assertTrue(os.path.isdir(d), d)
            pngs = [f for f in os.listdir(d) if f.endswith(".png")]
            self.assertEqual(len(pngs), 1, d)
            png = os.path.join(d, pngs[0])
            with open(png, "rb") as f:
                head = f.read(26)
            self.assertEqual(head[:8], b"\x89PNG\r\n\x1a\n", png)
            self.assertEqual(int.from_bytes(head[16:20], "big"), 512, png)
            self.assertEqual(int.from_bytes(head[20:24], "big"), 512, png)
            self.assertEqual(head[25], 6, "PNG must be RGBA (color type 6)")

    def test_images_have_real_transparency_and_subject(self):
        for pose in EXPECTED_POSES:
            cap = pose.capitalize()
            d = repo_path("Omo/Omo/Assets.xcassets/OmoPose{}.imageset".format(cap))
            png = os.path.join(d, [f for f in os.listdir(d) if f.endswith(".png")][0])
            transparent, opaque = png_alpha_stats(png)
            self.assertGreater(transparent, 0.15,
                               "{}: background must be removed".format(pose))
            self.assertGreater(opaque, 0.20,
                               "{}: character must remain".format(pose))


class TestPersistenceCompatibility(TestCase):
    def test_recall_mascot_state_raw_values(self):
        m = re.search(
            r"enum V2RecallMascotState: String, Codable, CaseIterable \{(.*?)\}",
            self.awake, re.S)
        self.assertIsNotNone(m)
        self.assertEqual(
            re.findall(r"case (\w+)", m.group(1)),
            ["idle", "reacting", "turning", "rummaging", "carrying",
             "watching", "acknowledging", "thinking", "sleeping", "farewell"])

    def test_appstorage_keys_unchanged(self):
        def keys(text):
            return set(re.findall(r'@AppStorage\("([^"]+)"\)', text))
        now = set()
        swift_files = []
        for root, _, files in os.walk(repo_path("Omo")):
            for f in files:
                if f.endswith(".swift"):
                    swift_files.append(os.path.join(root, f))
        for path in swift_files:
            now |= keys(read(path))
        base = set()
        for path in swift_files:
            rel = os.path.relpath(path, REPO)
            try:
                base |= keys(git("show", "{}:{}".format(BASELINE, rel)))
            except subprocess.CalledProcessError:
                pass
        self.assertEqual(now - base, set(), "new AppStorage keys are not allowed")
        self.assertEqual(base - now, set(), "AppStorage keys must not be removed")

    def test_pose_enum_is_not_persisted(self):
        for root, _, files in os.walk(repo_path("Omo")):
            for f in files:
                if not f.endswith(".swift"):
                    continue
                text = read(os.path.join(root, f))
                for line in text.splitlines():
                    if "OmoMascotPose" in line:
                        self.assertNotIn("@AppStorage", line)
                        self.assertNotIn("UserDefaults", line)
        self.assertNotIn("@AppStorage", self.pose)


class TestHomeIdle(TestCase):
    def test_default_pose_is_dazed(self):
        self.assertIn("homeMascotPose: OmoMascotPose = .dazed", self.awake)

    def test_idle_interval_bounds_8_to_14_seconds(self):
        self.assertIn(
            "UInt64.random(in: 8_000_000_000...14_000_000_000)", self.awake)

    def test_idle_rotates_only_stretch_and_smirk(self):
        m = re.search(r"runHomeMascotIdleLoop\(\) async \{(.*?)\n    \}", self.awake, re.S)
        self.assertIsNotNone(m)
        body = m.group(1)
        self.assertIn("stretchTurn ? .stretch : .smirk", body)
        for other in EXPECTED_POSES:
            if other in ("stretch", "smirk", "dazed"):
                continue
            self.assertNotIn(".{}".format(other), body)

    def test_idle_stops_conditions(self):
        m = re.search(r"runHomeMascotIdleLoop\(\) async \{(.*?)\n    \}", self.awake, re.S)
        body = m.group(1)
        self.assertIn("!reduceMotion", body)
        self.assertIn("!homeMascotHold", body)
        self.assertIn("isLowPowerModeEnabled", body)
        self.assertIn("Task.isCancelled", body)

    def test_tap_sequence_shy_heart_approve_smirk(self):
        self.assertIn("[.shy, .heart, .approve, .smirk]", self.awake)
        self.assertIn("homeMascotGreetingStep % sequence.count", self.awake)

    def test_idle_uses_task_id_cancellation_pattern(self):
        self.assertIn(".task(id: reduceMotion)", self.awake)
        self.assertIn(".task(id: homeMascotGreetingStep)", self.awake)


class TestSummonSequence(TestCase):
    def test_stage_to_visual_mapping(self):
        m = re.search(r"private var summonMascotView: some View \{(.*?)\n    \}",
                      self.shot, re.S)
        self.assertIsNotNone(m)
        body = m.group(1)
        self.assertRegex(body, r"case \.turn, \.approach:\s*\n\s*OmoFrameAtlasPlayer\(\s*\n\s*assetName: \"OmoMotionRunAtlas\"")
        self.assertRegex(body, r"case \.rummage:\s*\n\s*OmoFrameAtlasPlayer\(\s*\n\s*assetName: \"OmoMotionRummageAtlas\"")
        self.assertRegex(body, r"case \.carrying, \.orbit:\s*\n\s*OmoFrameAtlasPlayer\(\s*\n\s*assetName: \"OmoMotionCarryReturnAtlas\"")
        self.assertRegex(body, r"case \.settle, \.cue:\s*\n\s*OmoMascotPoseView\(pose: \.approve")

    def test_text_card_hidden_until_settle(self):
        m = re.search(r"private var summonCardIsVisible: Bool \{(.*?)\n    \}",
                      self.shot, re.S)
        self.assertIsNotNone(m)
        body = m.group(1)
        self.assertIn(
            "case .turn, .approach, .rummage, .carrying, .orbit: false", body)
        self.assertIn("case .settle, .cue: true", body)

    def test_summon_timings_first_1800ms_later_900ms(self):
        m = re.search(
            r"let timings: \[UInt64\] = currentIndex == 0\s*\n\s*\? \[([^\]]+)\]\s*\n\s*: \[([^\]]+)\]",
            self.shot)
        self.assertIsNotNone(m)
        first = sum(int(x.replace("_", "")) for x in m.group(1).split(","))
        later = sum(int(x.replace("_", "")) for x in m.group(2).split(","))
        self.assertEqual(first, 1_800_000_000)
        self.assertEqual(later, 900_000_000)

    def test_reduce_motion_summon_within_180ms(self):
        self.assertIn("try? await Task.sleep(nanoseconds: 180_000_000)", self.shot)

    def test_summon_is_skippable_and_cancellable(self):
        self.assertIn('Button("跳过过场")', self.shot)
        self.assertIn("guard !Task.isCancelled, phase == .summoning", self.shot)


class TestRecallCompanionAndFeedback(TestCase):
    def test_companion_confused_once_after_6_5s(self):
        self.assertIn("6_500_000_000", self.shot)
        self.assertIn("460_000_000", self.shot)
        self.assertIn("recallCompanionHasConfused = true", self.shot)
        self.assertIn("recallCompanionPose = .confused", self.shot)
        m = re.search(r"task\(id: currentCard\.id\) \{(.*?)\n                \}",
                      self.shot, re.S)
        self.assertIsNotNone(m)
        body = m.group(1)
        self.assertIn("guard !recallCompanionHasConfused", body)
        self.assertIn("!reduceMotion", body)
        self.assertIn("isLowPowerModeEnabled", body)

    def test_feedback_initial_pose_mapping(self):
        m = re.search(r"switch value \{(.*?)\n        \}", self.shot, re.S)
        self.assertIsNotNone(m)
        body = m.group(1)
        self.assertIn("case .remembered: feedbackPose = .approve", body)
        self.assertIn("case .fuzzy: feedbackPose = .confused", body)
        self.assertIn("case .forgot: feedbackPose = .dazed", body)

    def test_feedback_sequences(self):
        m = re.search(r"task\(id: assessmentReactionTick\) \{(.*?)\n        \}",
                      self.shot, re.S)
        self.assertIsNotNone(m)
        body = m.group(1)
        remembered = re.search(
            r"case \.remembered:\s*\n\s*feedbackPose = \.approve\s*\n.*?560_000_000.*?feedbackPose = \.heart",
            body, re.S)
        self.assertIsNotNone(remembered, "remembered: approve -> heart")
        fuzzy = re.search(
            r"case \.fuzzy:\s*\n\s*feedbackPose = \.confused\s*\n.*?760_000_000.*?feedbackPose = \.dazed",
            body, re.S)
        self.assertIsNotNone(fuzzy, "fuzzy: confused -> dazed")
        forgot = re.search(r"case \.forgot:\s*\n\s*feedbackPose = \.dazed", body)
        self.assertIsNotNone(forgot, "forgot: dazed companionship")

    def test_error_uses_dejected_only(self):
        m = re.search(r"private var feedbackDisplayPose: OmoMascotPose \{(.*?)\n    \}",
                      self.shot, re.S)
        self.assertIsNotNone(m)
        self.assertIn("if !assessmentError.isEmpty { return .dejected }", m.group(1))

    def test_stow_run_then_farewell(self):
        self.assertIn(
            "pose: stowStage == .farewell ? .farewell : .run", self.shot)


class TestScratchRevealAndDebris(TestCase):
    def test_brush_stays_26pt(self):
        self.assertIn("private let brushDiameter: CGFloat = 26", self.shot)

    def test_auto_reveal_threshold_stays_45_percent(self):
        self.assertGreaterEqual(self.shot.count("coverage >= 0.45"), 2)

    def test_reveal_progress_persistence_kept(self):
        for key in ["recallo.v06.revealCoverage", "recallo.v06.scratchPaths",
                    "recallo.v06.coveredCells", "recallo.v06.isRevealed"]:
            self.assertIn(key, self.shot)

    def test_yarn_debris_320ms_and_gating(self):
        self.assertIn("V2RevealYarnDebrisView", self.shot)
        self.assertIn("320_000_000", self.shot)
        m = re.search(r"private func reveal\(\) \{(.*?)\n    \}", self.shot, re.S)
        self.assertIsNotNone(m)
        body = m.group(1)
        self.assertRegex(body,
                         r"if !reduceMotion \{\s*\n\s*revealDebrisVisible = true\s*\n\s*revealDebrisTicket &\+= 1")
        d = re.search(r"private struct V2RevealYarnDebrisView: View \{(.*)\Z",
                      self.shot, re.S)
        self.assertIsNotNone(d)
        self.assertIn("withAnimation(.easeOut(duration: 0.32))", d.group(1))


class TestCopyAndRarity(TestCase):
    def test_assessment_button_copy_and_mapping_order(self):
        forgot = self.shot.find('assessmentButton("没想起", assessment: .forgot')
        fuzzy = self.shot.find('assessmentButton("想偏了", assessment: .fuzzy')
        remembered = self.shot.find('assessmentButton("想对了", assessment: .remembered')
        self.assertTrue(forgot != -1 and fuzzy != -1 and remembered != -1)
        self.assertLess(forgot, fuzzy)
        self.assertLess(fuzzy, remembered)

    def test_old_assessment_copy_removed(self):
        for token in ['assessmentButton("记得"', 'assessmentButton("模糊"',
                      'assessmentButton("忘记"']:
            self.assertNotIn(token, self.shot)

    def test_assessment_accessibility_identifiers_kept(self):
        self.assertIn('accessibilityIdentifier("v2.assessment.\\(assessment.rawValue)")',
                      self.shot)

    def test_confirmation_sheet_copy(self):
        self.assertIn('"编辑后确认"', self.tabs)
        self.assertIn('Button("仅存档")', self.tabs)
        self.assertIn('Button("删除", role: .destructive)', self.tabs)
        self.assertNotIn("确认并加入复习", self.tabs)
        self.assertNotIn("仅存档，不进入复习", self.tabs)

    def test_confirmation_refresh_without_reocr(self):
        root = read(repo_path("Omo/Omo/V2/V2RootView.swift"))
        self.assertIn("await refreshCaptureMemoryCards()", root)

    def test_rarity_only_on_settle(self):
        m = re.search(r"private var rarityIsRevealed: Bool \{(.*?)\n    \}",
                      self.shot, re.S)
        self.assertIsNotNone(m)
        self.assertIn("summonStage == .settle || summonStage == .cue", m.group(1))

    def test_rarity_no_probability_wording(self):
        for token in ["概率", "保底", "必中"]:
            self.assertNotIn(token, self.shot)
            self.assertNotIn(token, self.tabs)


class TestAccessibilityAndHygiene(TestCase):
    def test_scope_baseline_supports_environment_override(self):
        guard = read(repo_path("Omo/Scripts/frontend_static_guard.py"))
        tests = read(repo_path("Omo/Scripts/frontend_static_tests.py"))
        expected = 'os.environ.get("OMO_FRONTEND_SCOPE_BASE", "HEAD^")'
        hard_coded_sha = r'BASELINE\s*=\s*["\'][0-9a-f]{7,40}["\']'
        self.assertIn(expected, guard)
        self.assertIn(expected, tests)
        self.assertNotRegex(guard, hard_coded_sha)
        self.assertNotRegex(tests, hard_coded_sha)

    def test_pose_view_is_accessibility_hidden(self):
        self.assertIn(".accessibilityHidden(true)", self.pose)

    def test_reduce_motion_short_fade(self):
        self.assertIn("reduceMotion ? 0.12 : 0.18", self.pose)

    def test_recall_and_legacy_details_do_not_use_fixed_760_height(self):
        self.assertNotIn(".frame(height: 760", self.awake)
        self.assertNotIn(".frame(height: 760", self.tabs)

    def test_memory_cards_are_primary_and_legacy_chapters_collapsed(self):
        self.assertIn("V2MemoryLibraryEmptyState", self.tabs)
        self.assertIn("DisclosureGroup(isExpanded: $isLegacySectionExpanded)", self.tabs)
        self.assertIn("showsGeneratingChapterCard || !backendChapters.isEmpty", self.tabs)
        self.assertNotIn("V2GeneratedChaptersSummaryCard(count:", self.tabs)

    def test_memory_delete_is_in_menu_with_voiceover_action(self):
        card = re.search(
            r"private struct V2MemoryLibraryCard: View \{(.*?)"
            r"private struct V2CaptureConfirmationSheet",
            self.tabs,
            re.S,
        )
        self.assertIsNotNone(card)
        source = card.group(1)
        self.assertIn("Menu {", source)
        self.assertIn('Label("删除这条记忆", systemImage: "trash")', source)
        self.assertIn('.accessibilityAction(named: "删除这条记忆")', source)

    def test_profile_defaults_to_omo_identity(self):
        profile = read(repo_path(
            "Omo/Omo/V2/Components/Cards/V2ProfileCards.swift"))
        self.assertNotIn('"Cappy"', profile)
        self.assertNotIn('"Cappy"', self.tabs)
        self.assertIn('static let defaultName = "哦莫用户"', profile)
        self.assertIn("OmoMascotPoseView(pose: .smirk", profile)

    def test_scope_only_omo_changed(self):
        changed = git("diff", "--name-only", BASELINE).split()
        allowed_scope_files = {
            "README.md",
            "docs/asset-provenance.md",
            "docs/ios-api-data-contract-zh.md",
            "tools/cached-ui-fixture-guard.mjs",
        }
        bad = [
            f for f in changed
            if not f.startswith("Omo/") and f not in allowed_scope_files
        ]
        self.assertEqual(bad, [])

    def test_no_new_dependencies(self):
        for token in ["Lottie", "Rive"]:
            for root, _, files in os.walk(repo_path("Omo")):
                for f in files:
                    if f.endswith(".swift"):
                        self.assertNotIn(token, read(os.path.join(root, f)))

    def test_private_source_not_committed(self):
        changed = git("diff", "--name-only", BASELINE).split()
        for f in changed:
            self.assertNotIn("omo-pose-sheet", f)
            self.assertNotIn("omo-private-assets", f)
            self.assertNotIn("video-pilot", f)
            self.assertNotIn("delivery-v2", f)


class TestFrameAtlasPlayer(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.player = read(repo_path(
            "Omo/Omo/V2/Components/OmoFrameAtlasPlayer.swift"))

    def test_required_parameters(self):
        for token in ["let assetName: String", "let posterAssetName: String",
                      "let columns: Int",
                      "let rows: Int", "let frameCount: Int",
                      "let fps: Double", "let loop: Bool"]:
            self.assertIn(token, self.player)

    def test_timeline_view_playback(self):
        self.assertIn("TimelineView(.periodic(from: .now, by: 1 / clampedFPS))",
                      self.player)

    def test_fps_clamped_18_to_24(self):
        self.assertIn("min(24, max(18, fps))", self.player)

    def test_lazy_cached_slicing(self):
        self.assertIn("private actor OmoFrameAtlasStore", self.player)
        self.assertIn("if let cached = cache[key]", self.player)
        self.assertIn("cgImage.cropping(to: rect)", self.player)

    def test_interruptible(self):
        self.assertIn("guard !Task.isCancelled else { return }", self.player)
        self.assertIn(".task(id: playbackDescriptor)", self.player)

    def test_reduce_motion_poster_fade_within_180ms(self):
        self.assertIn("posterView", self.player)
        self.assertIn(".animation(.easeOut(duration: 0.18), value: reduceMotion)",
                      self.player)

    def test_reduce_motion_does_not_load_atlas(self):
        task = re.search(
            r"\.task\(id: playbackDescriptor\) \{(.*?)\n        \}",
            self.player, re.S)
        self.assertIsNotNone(task)
        body = task.group(1)
        self.assertLess(
            body.index("guard !reduceMotion else { return }"),
            body.index("OmoFrameAtlasStore.shared.frames("),
        )

    def test_loading_and_failure_fall_back_to_poster(self):
        self.assertIn("Image(posterAssetName)", self.player)
        self.assertNotIn("Color.clear", self.player)

    def test_motion_atlas_assets_present(self):
        assets = repo_path("Omo/Omo/Assets.xcassets")
        expected = {
            "OmoMotionRunAtlas.imageset": (2304, 2304),
            "OmoMotionRummageAtlas.imageset": (2304, 2304),
            "OmoMotionCarryReturnAtlas.imageset": (2304, 768),
        }
        for folder, (ew, eh) in expected.items():
            d = os.path.join(assets, folder)
            self.assertTrue(os.path.isdir(d), d)
            pngs = [f for f in os.listdir(d) if f.endswith(".png")]
            self.assertEqual(len(pngs), 1, d)
            with open(os.path.join(d, pngs[0]), "rb") as f:
                head = f.read(26)
            self.assertEqual(head[:8], b"\x89PNG\r\n\x1a\n", folder)
            self.assertEqual(int.from_bytes(head[16:20], "big"), ew, folder)
            self.assertEqual(int.from_bytes(head[20:24], "big"), eh, folder)
            self.assertEqual(head[25], 6, folder + " must be RGBA")

    def test_motion_poster_assets_present(self):
        assets = repo_path("Omo/Omo/Assets.xcassets")
        for name in [
            "OmoMotionRunPoster",
            "OmoMotionRummagePoster",
            "OmoMotionCarryReturnPoster",
        ]:
            d = os.path.join(assets, "{}.imageset".format(name))
            self.assertTrue(os.path.isdir(d), d)
            pngs = [f for f in os.listdir(d) if f.endswith(".png")]
            self.assertEqual(len(pngs), 1, d)
            with open(os.path.join(d, pngs[0]), "rb") as f:
                head = f.read(26)
            self.assertEqual(head[:8], b"\x89PNG\r\n\x1a\n", name)
            self.assertEqual(int.from_bytes(head[16:20], "big"), 384, name)
            self.assertEqual(int.from_bytes(head[20:24], "big"), 384, name)
            self.assertEqual(head[25], 6, name + " must be RGBA")
            transparent, opaque = png_alpha_stats(os.path.join(d, pngs[0]))
            self.assertGreater(transparent, 0.30,
                               name + ": poster background must be transparent")
            self.assertGreater(opaque, 0.10,
                               name + ": poster must keep the character")


class TestMotionAtlases(TestCase):
    ATLASES = {
        "OmoMotionRunAtlas": (2304, 2304, 6, 6, 32, "true"),
        "OmoMotionRummageAtlas": (2304, 2304, 6, 6, 32, "true"),
        "OmoMotionCarryReturnAtlas": (2304, 768, 6, 2, 10, "false"),
    }

    def test_atlases_decode_with_real_transparency(self):
        for name in self.ATLASES:
            d = repo_path("Omo/Omo/Assets.xcassets/{}.imageset".format(name))
            png = os.path.join(d, [f for f in os.listdir(d) if f.endswith(".png")][0])
            transparent, opaque = png_alpha_stats(png)
            self.assertGreater(transparent, 0.30,
                               "{}: atlas must be mostly transparent".format(name))
            self.assertGreater(opaque, 0.10,
                               "{}: frames must keep the character".format(name))

    def test_atlas_cell_grid_divides_evenly(self):
        for name, (ew, eh, cols, rows, _frames, _loop) in self.ATLASES.items():
            self.assertEqual(ew % cols, 0, name)
            self.assertEqual(eh % rows, 0, name)
            self.assertEqual(ew // cols, 384, name)
            self.assertEqual(eh // rows, 384, name)

    def test_atlas_contents_json_references_existing_png(self):
        import json
        for name in self.ATLASES:
            d = repo_path("Omo/Omo/Assets.xcassets/{}.imageset".format(name))
            with open(os.path.join(d, "Contents.json"), encoding="utf-8") as f:
                data = json.load(f)
            fnames = [img["filename"] for img in data["images"]]
            self.assertEqual(len(fnames), 1, name)
            self.assertTrue(os.path.isfile(os.path.join(d, fnames[0])), name)

    def test_summon_atlas_parameters_match_delivery(self):
        m = re.search(r"private var summonMascotView: some View \{(.*?)\n    \}",
                      self.shot, re.S)
        self.assertIsNotNone(m)
        body = m.group(1)
        for name, (_w, _h, cols, rows, frames, loop) in self.ATLASES.items():
            params = ("columns: {}, rows: {}, frameCount: {}, fps: 24, loop: {}"
                      .format(cols, rows, frames, loop))
            self.assertIn("assetName: \"{}\",".format(name), body)
            self.assertIn(params, body)
        poster_by_atlas = {
            "OmoMotionRunAtlas": "OmoMotionRunPoster",
            "OmoMotionRummageAtlas": "OmoMotionRummagePoster",
            "OmoMotionCarryReturnAtlas": "OmoMotionCarryReturnPoster",
        }
        for atlas, poster in poster_by_atlas.items():
            self.assertRegex(
                body,
                r'assetName: "{}",\s*\n\s*posterAssetName: "{}"'.format(
                    atlas, poster
                ),
            )

    def test_atlas_playback_interruptible_by_stage_switch(self):
        m = re.search(r"private var summonMascotView: some View \{(.*?)\n    \}",
                      self.shot, re.S)
        body = m.group(1)
        self.assertEqual(body.count("OmoFrameAtlasPlayer("), 3)
        self.assertIn(".task(id: playbackDescriptor)", self.player_source)

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.player_source = read(repo_path(
            "Omo/Omo/V2/Components/OmoFrameAtlasPlayer.swift"))


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromModule(sys.modules[__name__])
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
