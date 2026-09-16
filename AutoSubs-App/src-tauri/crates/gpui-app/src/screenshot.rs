//! Scripted walkthrough for visual checks without screen-recording permission.
//! Each step drives the real window (including synthetic OS file-drop events)
//! and saves the Metal-rendered frame as a PNG.

use std::path::{Path, PathBuf};
use std::time::Duration;

use gpui::*;

use crate::{OpenSelect, SpikeView};

thread_local! {
    pub static LAST_COPY: std::cell::RefCell<Option<String>> = const { std::cell::RefCell::new(None) };
}

pub fn run(window: WindowHandle<SpikeView>, out_dir: PathBuf, cx: &mut App) {
    std::fs::create_dir_all(&out_dir).expect("create screenshot dir");
    let sample = std::env::var("AUTOSUBS_SAMPLE_FILE")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/tmp/example.wav"));
    let executor = cx.background_executor().clone();

    cx.spawn(async move |cx| {
        let over_zone = point(px(200.), px(280.));
        let settle = || executor.timer(Duration::from_millis(400));
        let paths = |p: PathBuf| ExternalPaths([p].into_iter().collect());

        settle().await;
        save(window, &out_dir, "1-empty", cx);

        // Files dragged in from Finder, hovering the drop zone.
        dispatch(window, cx, vec![
            FileDropEvent::Entered { position: over_zone, paths: paths(sample.clone()) },
            FileDropEvent::Pending { position: over_zone },
        ]);
        settle().await;
        save(window, &out_dir, "2-dragging", cx);

        dispatch(window, cx, vec![
            FileDropEvent::Submit { position: over_zone },
            FileDropEvent::Ended,
        ]);
        settle().await;
        save(window, &out_dir, "3-dropped", cx);
        let _ = window.update(cx, |view, _, _| println!("file after drop: {:?}", view.file));

        let _ = window.update(cx, |view, _, cx| {
            view.open_select = Some(OpenSelect::Language);
            cx.notify();
        });
        settle().await;
        save(window, &out_dir, "4-language-select", cx);

        let _ = window.update(cx, |view, _, cx| {
            view.open_select = None;
            cx.notify();
        });
        settle().await;

        // Model picker: real click on the trigger, then keyboard and search.
        let trigger = window
            .update(cx, |view, _, cx| view.model_picker.read(cx).trigger_center())
            .unwrap();
        click(window, cx, trigger);
        executor.timer(Duration::from_millis(45)).await;
        save(window, &out_dir, "7a-picker-pop-mid", cx);
        settle().await;
        save(window, &out_dir, "7b-picker-open", cx);
        key(window, cx, "down");
        key(window, cx, "down");
        settle().await;
        save(window, &out_dir, "7c-picker-keyboard", cx);
        let _ = window.update(cx, |view, window, cx| {
            view.model_picker.update(cx, |p, cx| p.set_query("whisper", window, cx))
        });
        settle().await;
        save(window, &out_dir, "7d-picker-search", cx);
        key(window, cx, "down");
        key(window, cx, "enter");
        settle().await;
        let _ = window.update(cx, |view, _, cx| {
            println!("picked: {}", view.model_picker.read(cx).selected().id)
        });
        save(window, &out_dir, "7e-picker-picked", cx);

        // Live language switch while the picker is open, then with it closed.
        cx.update(|cx| crate::i18n::set_locale("ru", cx));
        settle().await;
        save(window, &out_dir, "9a-ru-picker", cx);
        let trigger = window
            .update(cx, |view, _, cx| view.model_picker.read(cx).trigger_center())
            .unwrap();
        click(window, cx, trigger);
        cx.update(|cx| crate::i18n::set_locale("ja", cx));
        settle().await;
        save(window, &out_dir, "9b-ja", cx);
        key(window, cx, "escape");
        cx.update(|cx| crate::i18n::set_locale("en", cx));
        settle().await;

        // Drag the sidebar divider, then grow the window.
        let widths = |cx: &mut AsyncApp| {
            window
                .update(cx, |view, window, cx| {
                    format!("{:?} window={:?}", view.split.read(cx).sizes(), window.viewport_size().width)
                })
                .unwrap()
        };
        println!("split before: {}", widths(cx));
        let handle_x = window.update(cx, |_, w, _| w.viewport_size().width - px(372.)).unwrap();
        drag(window, cx, &executor, point(handle_x, px(400.)), point(px(420.), px(400.))).await;
        settle().await;
        println!("split after dragging divider right: {}", widths(cx));
        save(window, &out_dir, "8a-sidebar-wide", cx);
        drag(window, cx, &executor, point(px(420.), px(400.)), point(px(300.), px(400.))).await;
        settle().await;
        println!("split after dragging divider left (past min): {}", widths(cx));
        save(window, &out_dir, "8b-sidebar-narrow", cx);
        let _ = window.update(cx, |_, window, _| window.resize(size(px(1000.), px(706.))));
        settle().await;
        settle().await;
        println!("split after window grow: {}", widths(cx));
        save(window, &out_dir, "8c-window-wide", cx);

        // Widen the sidebar to its max, then shrink the window to its minimum:
        // the sidebar must shrink to fit rather than be clipped.
        let handle_x = window
            .update(cx, |view, w, cx| w.viewport_size().width - view.split.read(cx).sizes()[1])
            .unwrap();
        drag(window, cx, &executor, point(handle_x, px(400.)), point(px(300.), px(400.))).await;
        settle().await;
        let _ = window.update(cx, |_, window, _| window.resize(size(px(700.), px(706.))));
        settle().await;
        settle().await;
        let sidebar_right = window
            .update(cx, |_, w, _| w.viewport_size().width)
            .unwrap();
        println!("window shrunk: viewport {sidebar_right:?}");
        save(window, &out_dir, "8d-window-narrow", cx);
        let _ = window.update(cx, |_, window, _| window.resize(size(px(760.), px(706.))));
        settle().await;

        let _ = window.update(cx, |view, _, cx| {
            view.open_select = None;
            cx.notify();
        });
        // Unsupported file is rejected with an inline message.
        dispatch(window, cx, vec![
            FileDropEvent::Entered { position: over_zone, paths: paths("/tmp/notes.txt".into()) },
            FileDropEvent::Submit { position: over_zone },
            FileDropEvent::Ended,
        ]);
        settle().await;
        save(window, &out_dir, "5-rejected", cx);

        // Optional end-to-end runs in one session, e.g. AUTOSUBS_RUN=plain,diarize
        // (the second run is what used to crash).
        let runs = std::env::var("AUTOSUBS_RUN").unwrap_or_default();
        // Keep test runs on a small model; the picker steps above may have
        // selected a large one.
        let model = std::env::var("AUTOSUBS_TEST_MODEL").unwrap_or_else(|_| "small".into());
        let _ = window.update(cx, |view, _, cx| {
            view.model_picker.update(cx, |picker, cx| picker.select_id(&model, cx))
        });
        for mode in runs.split(',').filter(|m| !m.is_empty()) {
            let _ = window.update(cx, |view, _, cx| {
                view.drop_error = None;
                view.diarize = mode == "diarize";
                view.start(cx);
            });
            loop {
                executor.timer(Duration::from_millis(500)).await;
                let busy = window.update(cx, |view, _, _| view.busy).unwrap_or(false);
                if !busy {
                    break;
                }
            }
            settle().await;
            let _ = window.update(cx, |view, _, _| println!("{mode} run: {}", view.status));
            save(window, &out_dir, &format!("6-run-{mode}"), cx);
        }

        // Reopen a saved transcript instead of transcribing, e.g.
        // AUTOSUBS_TRANSCRIPT=example opens the newest document with that name.
        let mut have_subtitles = !runs.is_empty();
        if let Ok(name) = std::env::var("AUTOSUBS_TRANSCRIPT") {
            let trigger = window
                .update(cx, |view, _, cx| view.history.read(cx).trigger_center())
                .unwrap();
            click(window, cx, trigger);
            // One frame later: the cached list should already be there.
            executor.timer(Duration::from_millis(20)).await;
            save(window, &out_dir, "11a-history-first-frame", cx);
            input(window, cx, vec![PlatformInput::ScrollWheel(ScrollWheelEvent {
                position: trigger + point(px(-150.), px(150.)),
                delta: ScrollDelta::Pixels(point(px(0.), px(-900.))),
                ..Default::default()
            })]);
            settle().await;
            save(window, &out_dir, "11a-history", cx);
            let entry = crate::history::list_transcripts()
                .into_iter()
                .find(|e| e.display_name.to_lowercase().contains(&name.to_lowercase()));
            match entry {
                Some(entry) => {
                    println!("opening transcript: {}", entry.filename);
                    let _ = window.update(cx, |view, _, cx| {
                        view.history.update(cx, |h, cx| h.open_document(entry.filename.clone(), cx))
                    });
                    settle().await;
                    let _ = window.update(cx, |view, _, _| println!("loaded {} subtitles", view.segments.len()));
                    save(window, &out_dir, "11b-history-opened", cx);
                    have_subtitles = true;
                }
                None => println!("no transcript matching {name:?}"),
            }
        }

        if have_subtitles {
            // Select subtitle text by dragging across the first row.
            let right = window
                .update(cx, |view, w, cx| w.viewport_size().width - view.split.read(cx).sizes()[1])
                .unwrap();
            // Reproduce the bug: nothing focused before selecting.
            let _ = window.update(cx, |_, window, cx| window.blur(cx));
            let _ = window.update(cx, |view, _, cx| {
                view.list_state.scroll_to(ListOffset { item_ix: 0, offset_in_item: px(0.) });
                cx.notify();
            });
            settle().await;
            // First row: 134px of chrome, 14px padding, 24px timestamp row, 8px gap.
            drag(window, cx, &executor, point(right + px(18.), px(190.)), point(right + px(150.), px(190.))).await;
            settle().await;
            let _ = cx.update_window(window.into(), |_, window, cx| {
                println!("selected text: {:?}", gpui_base::TextSelection::selected_text(window, cx))
            });
            key(window, cx, "cmd-c");
            println!("copied: {:?}", LAST_COPY.with(|c| c.borrow().clone()));
            save(window, &out_dir, "10a-selection", cx);

            let _ = window.update(cx, |view, window, cx| {
                view.subtitle_search.update(cx, |s, cx| s.set_value("human", window, cx));
            });
            settle().await;
            let _ = window.update(cx, |view, _, cx| {
                println!("search 'human': {:?} of {}", view.filtered.as_ref().map(Vec::len), view.segments.len());
                let _ = cx;
            });
            save(window, &out_dir, "10b-search", cx);
        }

        cx.update(|cx| cx.quit());
    })
    .detach();
}

fn input(window: WindowHandle<SpikeView>, cx: &mut AsyncApp, events: Vec<PlatformInput>) {
    let _ = cx.update_window(window.into(), |_, window, cx| {
        for event in events {
            window.dispatch_event(event, cx);
        }
    });
}

fn click(window: WindowHandle<SpikeView>, cx: &mut AsyncApp, position: Point<Pixels>) {
    input(window, cx, vec![
        PlatformInput::MouseDown(MouseDownEvent {
            button: MouseButton::Left,
            position,
            modifiers: Modifiers::default(),
            click_count: 1,
            first_mouse: false,
        }),
        PlatformInput::MouseUp(MouseUpEvent {
            button: MouseButton::Left,
            position,
            modifiers: Modifiers::default(),
            click_count: 1,
        }),
    ]);
}

/// Press, move in steps with a frame between each (the resize listener is
/// re-armed on paint, as in a real drag), then release.
async fn drag(
    window: WindowHandle<SpikeView>,
    cx: &mut AsyncApp,
    executor: &BackgroundExecutor,
    from: Point<Pixels>,
    to: Point<Pixels>,
) {
    input(window, cx, vec![PlatformInput::MouseDown(MouseDownEvent {
        button: MouseButton::Left,
        position: from,
        modifiers: Modifiers::default(),
        click_count: 1,
        first_mouse: false,
    })]);
    for step in 1..=10 {
        let t = step as f32 / 10.;
        input(window, cx, vec![PlatformInput::MouseMove(MouseMoveEvent {
            position: point(from.x + (to.x - from.x) * t, from.y),
            pressed_button: Some(MouseButton::Left),
            modifiers: Modifiers::default(),
        })]);
        executor.timer(Duration::from_millis(30)).await;
    }
    input(window, cx, vec![PlatformInput::MouseUp(MouseUpEvent {
        button: MouseButton::Left,
        position: to,
        modifiers: Modifiers::default(),
        click_count: 1,
    })]);
}

fn key(window: WindowHandle<SpikeView>, cx: &mut AsyncApp, keystroke: &str) {
    input(window, cx, vec![PlatformInput::KeyDown(KeyDownEvent {
        keystroke: Keystroke::parse(keystroke).unwrap(),
        is_held: false,
        prefer_character_input: false,
    })]);
}

fn dispatch(window: WindowHandle<SpikeView>, cx: &mut AsyncApp, events: Vec<FileDropEvent>) {
    // Lease the window, not the root view, so listeners can update the view.
    let _ = cx.update_window(window.into(), |_, window, cx| {
        for event in events {
            window.dispatch_event(PlatformInput::FileDrop(event), cx);
        }
    });
}

fn save(window: WindowHandle<SpikeView>, dir: &Path, name: &str, cx: &mut AsyncApp) {
    let path = dir.join(format!("{name}.png"));
    let _ = window.update(cx, |_, window, _| {
        let image = window.render_to_image().expect("render_to_image");
        image.save(&path).expect("save png");
        println!("saved {}", path.display());
    });
}
