"""Tests for the cross-outlet story comparison: python -m unittest discover -s pipeline/tests"""
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from compare import active_during, compare_story, headline_frame  # noqa: E402

T0 = datetime(2026, 10, 30, 8, 0, tzinfo=timezone.utc)
SOURCES = {
    "yle-uutiset": {"id": "yle-uutiset", "family": "yle"},
    "yle-news": {"id": "yle-news", "family": "yle"},
    "yle-urheilu": {"id": "yle-urheilu", "family": "yle", "scope": ["sport"]},
    "hs": {"id": "hs"}, "aamulehti": {"id": "aamulehti"}, "is": {"id": "is"}, "il": {"id": "il"},
    "kaleva": {"id": "kaleva"}, "mtv": {"id": "mtv"},
}


def art(source, title, hours=0.0, lede=""):
    dt = T0 + timedelta(hours=hours)
    return {"id": f"{source}{hours}", "source": source, "title": title, "lede": lede, "_dt": dt,
            "url": f"https://example.com/{source}/{hours}", "published": dt.isoformat()}


class FrameTests(unittest.TestCase):
    def flags(self, title):
        return headline_frame(title)["flags"]

    def test_question_quote_speaker(self):
        self.assertIn("question", self.flags("Miten pääministerit kommentoivat puhelua?"))
        self.assertIn("quote", self.flags("Ministeri tyrmistyi – ”Käsittämätöntä”"))
        self.assertIn("speaker", self.flags("Orpo: Kyse ei ollut Suomen ja Venäjän suhteesta"))
        self.assertIn("exclaim", self.flags("Jättikäänne! Venäjä jääkiekon MM-kisoihin"))

    def test_kickers(self):
        self.assertEqual(self.flags("Jääkiekko | Venäjä pääsee jääkiekon MM-kisoihin"), [])
        self.assertIn("opinion", self.flags("Analyysi: Hallitus on ahtaalla"))
        self.assertIn("live", self.flags("Suora lähetys: Pääministerit kommentoivat"))
        self.assertIn("attributed", self.flags("Yle: Tanskan pääministeri tuohtui puhelusta"))

    def test_plain_headline_has_no_flags(self):
        self.assertEqual(self.flags("Eduskunta hyväksyi budjetin"), [])
        self.assertNotIn("speaker", self.flags("EU:n komissio esittää uusia pakotteita"))

    def test_emotive_words(self):
        f = headline_frame("Kohu ja kaaos: hallitus romahti")
        self.assertIn("emotive", f["flags"])
        self.assertIn("kohu", f["emotive"])
        self.assertNotIn("emotive", self.flags("Hotelli avautuu Kristiinankaupungissa"))


class CompareTests(unittest.TestCase):
    def setUp(self):
        self.members = [
            art("hs", "Venäjä pääsee jääkiekon MM-kisoihin", 0),
            art("aamulehti", "Venäjä pääsee jääkiekon MM-kisoihin", 0.2),
            art("yle-uutiset", "Venäjä palaa jääkiekon MM-kisoihin, linjasi CAS", 0.1),
            art("yle-news", "Russia returns to the ice hockey World Championship", 0.5),
            art("il", "Ministeri tyrmistyi Venäjän paluusta – ”Käsittämätöntä”", 2.0),
            art("il", "Näin Venäjän paluu MM-kisoihin ratkesi", 3.0),
        ]
        self.active = {"hs", "aamulehti", "yle-uutiset", "yle-news", "yle-urheilu", "il", "is", "kaleva"}

    def test_outlets_ordered_with_delays(self):
        c = compare_story(self.members, SOURCES, self.active, ["sport"])
        self.assertEqual([o["s"] for o in c["outlets"]][:2], ["hs", "yle-uutiset"])
        il = next(o for o in c["outlets"] if o["s"] == "il")
        self.assertEqual(il["delay_h"], 2.0)
        self.assertEqual(il["n"], 2)
        self.assertEqual(len(il["more"]), 1)
        self.assertEqual(c["spread_h"], 2.0)

    def test_families_and_shared_text(self):
        c = compare_story(self.members, SOURCES, self.active, ["sport"])
        self.assertEqual(c["families"], 4)          # hs, aamulehti, yle (two feeds), il
        self.assertEqual(c["shared"], [["hs", "aamulehti"]])
        self.assertEqual(c["independent"], 3)       # the shared copy counts once

    def test_missing_respects_family_and_scope(self):
        c = compare_story(self.members, SOURCES, self.active, ["sport"])
        self.assertEqual(c["missing"], ["is", "kaleva"])  # yle-urheilu is in the yle family
        c2 = compare_story(self.members[:2], SOURCES, {"hs", "aamulehti", "yle-urheilu", "mtv"}, ["politics"])
        self.assertEqual(c2["missing"], ["mtv"])          # sports-only feed not expected on politics

    def test_word_choice(self):
        c = compare_story(self.members, SOURCES, self.active, ["sport"])
        self.assertIn("venäjä", c["consensus"])
        il = next(o for o in c["outlets"] if o["s"] == "il")
        self.assertIn("tyrmistyi", il["own"])
        hs = next(o for o in c["outlets"] if o["s"] == "hs")
        self.assertEqual(hs["own"], [])

    def test_active_during(self):
        arts = [art("hs", "a", -5), art("is", "b", 1), art("kaleva", "c", 30)]
        self.assertEqual(active_during(arts, T0, T0 + timedelta(hours=3)), {"is"})


if __name__ == "__main__":
    unittest.main()
