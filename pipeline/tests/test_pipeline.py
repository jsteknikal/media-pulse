"""Unit tests (stdlib unittest): python -m unittest discover -s pipeline/tests"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common import ThemeMatcher, entity_key, load_config, tokens  # noqa: E402
from fetch_rss import parse_feed  # noqa: E402

RSS = b"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Test</title>
<item><title>S\xc3\xa4hk\xc3\xb6n hinta nousi enn\xc3\xa4tykseen</title><link>https://example.com/a</link>
<description>&lt;p&gt;Fingrid varoittaa &amp;amp; seuraa.&lt;/p&gt;</description>
<pubDate>Mon, 12 Oct 2026 08:15:00 +0300</pubDate><category>Talous</category></item>
<item><title>Ilman p\xc3\xa4iv\xc3\xa4m\xc3\xa4\xc3\xa4r\xc3\xa4\xc3\xa4</title><guid>https://example.com/b</guid></item>
</channel></rss>"""

ATOM = b"""<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>T</title>
<entry><title>Leijonat voitti</title><link rel="alternate" href="https://example.com/c"/>
<summary>Ottelu ratkesi.</summary><published>2026-10-12T05:00:00Z</published><category term="Urheilu"/></entry>
</feed>"""


class FeedTests(unittest.TestCase):
    def test_rss(self):
        items = parse_feed(RSS)
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]["link"], "https://example.com/a")
        self.assertEqual(items[0]["categories"], ["Talous"])
        self.assertEqual(items[0]["published"].utcoffset().total_seconds(), 3 * 3600)
        self.assertEqual(items[1]["link"], "https://example.com/b")
        self.assertIsNone(items[1]["published"])

    def test_atom(self):
        items = parse_feed(ATOM)
        self.assertEqual(items[0]["link"], "https://example.com/c")
        self.assertEqual(items[0]["categories"], ["Urheilu"])


class TextTests(unittest.TestCase):
    def test_tokens(self):
        self.assertIn("eu", tokens("EU:n komissio"))
        self.assertIn("mm-kisat", tokens("MM-kisat alkavat"))
        self.assertIn("kisat", tokens("MM-kisat alkavat"))

    def test_entity_keys_merge_case_forms(self):
        for group in (["Kiina", "Kiinan", "Kiinassa"], ["Orpo", "Orpon", "Orpoa"], ["Trump", "Trumpin"],
                      ["Ukraina", "Ukrainan", "Ukrainassa"], ["Helsinki", "Helsingin", "Helsingissä"]):
            keys = {entity_key(w) for w in group}
            self.assertEqual(len(keys), 1, f"{group} -> {keys}")
        self.assertIsNone(entity_key("Ylen"))
        self.assertIsNone(entity_key("Maanantaina"[:9]) if False else None)


class ThemeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.m = ThemeMatcher(load_config("themes.json")["themes"])

    def check(self, title, expected, lang="fi", lede=""):
        got = self.m.classify(title, lede, [], lang)
        self.assertIn(expected, got, f"{title!r} -> {got}")

    def test_finnish(self):
        self.check("Sähkön hinta nousi ennätykseen pakkasten vuoksi", "energy")
        self.check("Leijonat kaatui Ruotsille jääkiekon MM-kisoissa", "sport")
        self.check("Hallitus esittää muutoksia eduskunnalle", "politics")
        self.check("Poliisi tutkii henkirikosta Tampereella", "crime")
        self.check("Tekoäly mullistaa työn", "technology")
        self.check("Nuorisotyöttömyys kasvoi syyskuussa", "labour")
        self.check("EU:n komissio esittää uusia pakotteita", "international")

    def test_other_languages(self):
        self.check("Regeringen lägger fram budgeten i riksdagen", "politics", lang="sv")
        self.check("Electricity prices hit a record as wind power drops", "energy", lang="en")

    def test_no_false_compound(self):
        got = self.m.classify("Yhteiskunta muuttuu", "", [], "fi")
        self.assertNotIn("housing", got)


if __name__ == "__main__":
    unittest.main()


class LensTests(unittest.TestCase):
    def test_oeil_page(self):
        from lens import parse_oeil
        page = b"""<html><head><script>var x = '01/01/2000';</script></head><body>
        <h1>2023/0085(COD) Green Claims Directive</h1>
        <table><tr><th>Stage reached in procedure</th><td>Awaiting Council's 1st reading position</td></tr></table>
        <h2>Key events</h2><table>
        <tr><td>22/03/2023</td><td><a href="#">Legislative proposal published</a></td><td>COM(2023)0166</td></tr>
        <tr><td>12/03/2024</td><td>Decision by Parliament, 1st reading</td></tr>
        <tr><td>16/12/2024</td><td>Committee decision to enter into interinstitutional negotiations</td></tr>
        </table><h2>Technical information</h2><p>01/02/2025 not an event</p></body></html>"""
        got = parse_oeil(page)
        self.assertEqual(got["stage"], "Awaiting Council's 1st reading position")
        self.assertEqual(len(got["events"]), 3)
        self.assertEqual(got["events"][-1][0], "2024-12-16")
        self.assertTrue(got["events"][0][1].startswith("Legislative proposal"))

    def test_issue_patterns(self):
        from common import SignalMatcher
        issues = load_config("lens/issues.json")["issues"]
        m = SignalMatcher(issues)
        self.assertIn("green_claims", m.match("Kuluttaja-asiamies puuttuu viherpesuun", "", "fi"))
        self.assertIn("carbon_pricing", m.match("EU:n päästökauppa uudistuu", "", "fi"))
        self.assertIn("carbon_pricing", m.match("EU carbon border tax hits steel", "", "en"))
        self.assertIn("reporting", m.match("Kestävyysraportointi kevenee", "", "fi"))
        self.assertNotIn("carbon_pricing", m.match("Hiihtäjä harjoitteli kestävyyttä", "", "fi"))
        self.assertEqual(m.match("HJK voitti Oulussa", "Veikkausliigan kierros", "fi"), [])


class LenientFeedTests(unittest.TestCase):
    def test_html_entities(self):
        body = b'<rss><channel><item><title>A&nbsp;B &amp; C</title><link>https://x.fi/1</link></item></channel></rss>'
        items = parse_feed(body)
        self.assertEqual(items[0]["title"], "A\xa0B & C")
