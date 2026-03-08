use eyre::{Result, eyre};
use transcription_engine::{get_translate_languages, translate};

struct CliArgs {
    text: String,
    from: String,
    to: String,
    list_languages: bool,
}

fn print_usage(program: &str) {
    eprintln!("Usage: {program} <text> [options]");
    eprintln!("       {program} --list-languages");
    eprintln!("\nOptions:");
    eprintln!("  --from <code>           Source language code (default: auto)");
    eprintln!("  --to <code>             Target language code (default: en)");
    eprintln!("  --list-languages        Print supported target language codes");
}

fn parse_args() -> Result<CliArgs> {
    let mut args = std::env::args().skip(1);
    let program = std::env::args().next().unwrap_or_else(|| "cargo run --example translate --".into());

    let mut text: Option<String> = None;
    let mut from = "auto".to_string();
    let mut to = "en".to_string();
    let mut list_languages = false;

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--from" => {
                from = args.next().ok_or_else(|| eyre!("missing value for --from"))?;
            }
            "--to" => {
                to = args.next().ok_or_else(|| eyre!("missing value for --to"))?;
            }
            "--list-languages" => {
                list_languages = true;
            }
            "-h" | "--help" => {
                print_usage(&program);
                std::process::exit(0);
            }
            value if value.starts_with('-') => {
                return Err(eyre!("unknown option: {value}"));
            }
            value => {
                if text.is_some() {
                    return Err(eyre!("unexpected extra positional argument: {value}"));
                }
                text = Some(value.to_string());
            }
        }
    }

    if list_languages {
        return Ok(CliArgs {
            text: String::new(),
            from,
            to,
            list_languages,
        });
    }

    let text = match text {
        Some(text) => text,
        None => {
            print_usage(&program);
            return Err(eyre!("missing required <text> argument"));
        }
    };

    Ok(CliArgs {
        text,
        from,
        to,
        list_languages,
    })
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = parse_args()?;

    if args.list_languages {
        println!("Supported target languages: {:?}", get_translate_languages());
        return Ok(());
    }

    let translated = translate::translate_text(&args.text, &args.from, &args.to).await?;
    println!("Translated text: {}", translated);

    Ok(())
}
