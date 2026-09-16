//! Translations read from the Tauri app's i18next JSON files, so both
//! front-ends share one set of strings while they coexist.
//!
//! Mirrors the i18next behaviour the app relies on: dotted key lookup,
//! `{{name}}` interpolation, `_one`/`_few`/`_many`/`_other` plural keys chosen
//! by CLDR rules, and falling back to English, then to the key itself.

use std::collections::HashMap;
use std::fmt::Display;

use gpui::{App, Global, SharedString};
use intl_pluralrules::{PluralCategory, PluralRuleType, PluralRules};
use serde_json::Value;
use unic_langid::LanguageIdentifier;

macro_rules! locales {
    ($($code:literal),* $(,)?) => {
        /// Same list and order as `SUPPORTED_UI_LANGUAGES` in `src/i18n/index.ts`.
        pub const SUPPORTED: &[&str] = &[$($code),*];
        const SOURCES: &[(&str, &str)] = &[$((
            $code,
            include_str!(concat!("../../../../src/i18n/locales/", $code, "/translation.json")),
        )),*];
    };
}

locales!["en", "de", "es", "fr", "ja", "ko", "ru", "zh"];

const FALLBACK: &str = "en";

struct Bundle {
    strings: Value,
    plurals: PluralRules,
}

pub struct I18n {
    locale: &'static str,
    bundles: HashMap<&'static str, Bundle>,
}

impl Global for I18n {}

/// Loads every locale and picks the starting language: `AUTOSUBS_UI_LANG`
/// when set (handy for checking a translation), otherwise the system language.
pub fn init(cx: &mut App) {
    let bundles = SOURCES
        .iter()
        .map(|&(code, json)| {
            let langid: LanguageIdentifier = code.parse().expect("locale code");
            let bundle = Bundle {
                strings: serde_json::from_str(json)
                    .unwrap_or_else(|e| panic!("invalid {code} translation.json: {e}")),
                plurals: PluralRules::create(langid, PluralRuleType::CARDINAL)
                    .expect("plural rules for supported locale"),
            };
            (code, bundle)
        })
        .collect();

    let requested = std::env::var("AUTOSUBS_UI_LANG")
        .ok()
        .into_iter()
        .chain(sys_locale::get_locales());
    let locale = preferred_locale(requested);
    cx.set_global(I18n { locale, bundles });
}

/// Mirrors `normalizeUiLanguage`: exact match, then base language ("pt-BR" ->
/// "pt"), otherwise English. The first supported preference wins.
fn preferred_locale(requested: impl IntoIterator<Item = String>) -> &'static str {
    for lang in requested {
        let lang = lang.to_lowercase().replace('_', "-");
        let base = lang.split('-').next().unwrap_or_default();
        if let Some(code) = SUPPORTED.iter().find(|&&c| c == lang || c == base) {
            return code;
        }
    }
    FALLBACK
}

pub fn locale(cx: &App) -> &'static str {
    cx.global::<I18n>().locale
}

/// Switches the UI language and redraws every window. Unused until the
/// settings screen is ported.
#[cfg_attr(not(feature = "screenshot"), allow(dead_code))]
pub fn set_locale(locale: &str, cx: &mut App) {
    if let Some(&code) = SUPPORTED.iter().find(|&&c| c == locale) {
        cx.global_mut::<I18n>().locale = code;
        cx.refresh_windows();
    }
}

/// Translated string for `key`.
pub fn t(cx: &App, key: &str) -> SharedString {
    t_args(cx, key, &[])
}

/// Translated string with `{{name}}` placeholders filled from `args`.
pub fn t_args(cx: &App, key: &str, args: &[(&str, &dyn Display)]) -> SharedString {
    let i18n = cx.global::<I18n>();
    let text = i18n.resolve(key, None).unwrap_or(key);
    interpolate(text, args).into()
}

/// Plural-aware string: picks the `_one`/`_few`/`_many`/`_other` variant for
/// `count` and fills `{{count}}` along with any other `args`.
pub fn t_count(cx: &App, key: &str, count: usize, args: &[(&str, &dyn Display)]) -> SharedString {
    let i18n = cx.global::<I18n>();
    let text = i18n.resolve(key, Some(count)).unwrap_or(key);
    let mut all: Vec<(&str, &dyn Display)> = vec![("count", &count)];
    all.extend_from_slice(args);
    interpolate(text, &all).into()
}

impl I18n {
    fn resolve(&self, key: &str, count: Option<usize>) -> Option<&str> {
        [self.locale, FALLBACK]
            .into_iter()
            .filter_map(|code| self.bundles.get(code))
            .find_map(|bundle| bundle.lookup(key, count))
    }
}

impl Bundle {
    fn lookup(&self, key: &str, count: Option<usize>) -> Option<&str> {
        let segments: Vec<&str> = key.split('.').collect();
        if let Some(count) = count {
            let category = match self.plurals.select(count) {
                Ok(PluralCategory::ZERO) => "zero",
                Ok(PluralCategory::ONE) => "one",
                Ok(PluralCategory::TWO) => "two",
                Ok(PluralCategory::FEW) => "few",
                Ok(PluralCategory::MANY) => "many",
                _ => "other",
            };
            for suffix in [category, "other"] {
                let mut plural = segments.clone();
                let last = format!("{}_{suffix}", plural.pop().unwrap_or_default());
                plural.push(&last);
                if let Some(text) = find(&self.strings, &plural) {
                    return Some(text);
                }
            }
        }
        find(&self.strings, &segments)
    }
}

/// Walks nested objects, also matching keys that themselves contain dots
/// (e.g. `"analyze.diarize"`), as i18next does.
fn find<'a>(node: &'a Value, segments: &[&str]) -> Option<&'a str> {
    if segments.is_empty() {
        return node.as_str();
    }
    let object = node.as_object()?;
    (1..=segments.len()).find_map(|n| {
        let child = object.get(&segments[..n].join("."))?;
        find(child, &segments[n..])
    })
}

fn interpolate(text: &str, args: &[(&str, &dyn Display)]) -> String {
    if args.is_empty() || !text.contains("{{") {
        return text.to_string();
    }
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find("{{") {
        let Some(len) = rest[start..].find("}}") else { break };
        out.push_str(&rest[..start]);
        // `{{- name}}` is i18next's unescaped form; nothing is escaped here anyway.
        let name = rest[start + 2..start + len].trim().trim_start_matches('-').trim();
        match args.iter().find(|(arg, _)| *arg == name) {
            Some((_, value)) => out.push_str(&value.to_string()),
            None => out.push_str(&rest[start..start + len + 2]),
        }
        rest = &rest[start + len + 2..];
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bundle(code: &str) -> Bundle {
        let json = SOURCES.iter().find(|(c, _)| *c == code).unwrap().1;
        Bundle {
            strings: serde_json::from_str(json).unwrap(),
            plurals: PluralRules::create(code.parse::<LanguageIdentifier>().unwrap(), PluralRuleType::CARDINAL).unwrap(),
        }
    }

    #[test]
    fn nested_and_dotted_keys() {
        let en = bundle("en");
        assert_eq!(en.lookup("actionBar.fileDrop.prompt", None), Some("Drop file or click"));
        assert_eq!(en.lookup("progressSteps.analyze.diarize", None), Some("Identifying speakers"));
        assert_eq!(en.lookup("does.not.exist", None), None);
    }

    #[test]
    fn plural_categories() {
        let en = bundle("en");
        assert_eq!(en.lookup("output.speakers.label", Some(1)), Some("{{count}} speaker"));
        assert_eq!(en.lookup("output.speakers.label", Some(3)), Some("{{count}} speakers"));

        let ru = bundle("ru");
        let key = "progressSteps.speakersFound";
        assert_eq!(ru.lookup(key, Some(21)), Some("{{count}} спикер"));
        assert_eq!(ru.lookup(key, Some(3)), Some("{{count}} спикера"));
        assert_eq!(ru.lookup(key, Some(5)), Some("{{count}} спикеров"));
        // Keys without plural variants still resolve.
        assert!(ru.lookup("models.availableCount", Some(8)).is_some());
    }

    #[test]
    fn interpolation() {
        assert_eq!(interpolate("{{size}} RAM", &[("size", &"2GB")]), "2GB RAM");
        assert_eq!(interpolate("{{ count }} of {{total}}", &[("count", &1)]), "1 of {{total}}");
    }

    #[test]
    fn locale_preference() {
        assert_eq!(preferred_locale(["pt-BR".into(), "de-AT".into()]), "de");
        assert_eq!(preferred_locale(["zh_Hans_CN".into()]), "zh");
        assert_eq!(preferred_locale(Vec::<String>::new()), "en");
    }
}
