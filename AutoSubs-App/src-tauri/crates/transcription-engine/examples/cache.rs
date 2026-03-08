use eyre::{Result, eyre};
use std::path::PathBuf;
use transcription_engine::{delete_cached_model, list_cached_models};

enum Command {
    List,
    Delete { model: String },
}

struct CliArgs {
    cache_dir: PathBuf,
    command: Command,
}

fn print_usage(program: &str) {
    eprintln!("Usage: {program} [--cache-dir <path>] <command>");
    eprintln!("\nCommands:");
    eprintln!("  list                     List cached models");
    eprintln!("  delete <model>           Delete a cached model");
}

fn parse_args() -> Result<CliArgs> {
    let mut args = std::env::args().skip(1);
    let program = std::env::args().next().unwrap_or_else(|| "cargo run --example cache --".into());

    let mut cache_dir = PathBuf::from("./cache");
    let mut command: Option<Command> = None;

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--cache-dir" => {
                cache_dir = PathBuf::from(args.next().ok_or_else(|| eyre!("missing value for --cache-dir"))?);
            }
            "list" => {
                command = Some(Command::List);
            }
            "delete" => {
                let model = args.next().ok_or_else(|| eyre!("missing model name for delete"))?;
                command = Some(Command::Delete { model });
            }
            "-h" | "--help" => {
                print_usage(&program);
                std::process::exit(0);
            }
            value => {
                return Err(eyre!("unknown argument or command: {value}"));
            }
        }
    }

    let command = match command {
        Some(command) => command,
        None => {
            print_usage(&program);
            return Err(eyre!("missing command"));
        }
    };

    Ok(CliArgs { cache_dir, command })
}

fn main() -> Result<()> {
    let args = parse_args()?;

    match args.command {
        Command::List => {
            println!("Checking cached Whisper models in: {}", args.cache_dir.display());
            let models = list_cached_models(&args.cache_dir)?;
            if models.is_empty() {
                println!("No cached Whisper models found.");
            } else {
                println!("Found {} cached Whisper model(s):", models.len());
                for model in models {
                    println!("  - {}", model);
                }
            }
        }
        Command::Delete { model } => {
            println!("Deleting cached Whisper model '{model}' from {}", args.cache_dir.display());
            let deleted = delete_cached_model(&args.cache_dir, &model);
            if deleted {
                println!("Successfully deleted model: {model}");
            } else {
                println!("Model was not deleted: {model}");
            }
        }
    }

    Ok(())
}
