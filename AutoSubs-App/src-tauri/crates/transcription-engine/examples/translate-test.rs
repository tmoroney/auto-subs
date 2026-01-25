 use transcription_engine::{translate, get_translate_languages};

#[tokio::main]
async fn main() {
    // Translate text from any language to any other language
    let translated_text = translate::translate_text("Bonjour le monde!", "fr", "en").await.unwrap();
    println!("Translated text: {}", translated_text);

    // List the supported languages of the crate
    let supported_languages = get_translate_languages();
    println!("Supported languages: {:?}", supported_languages);
}