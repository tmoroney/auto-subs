//! App-owned components built on `gpui-base` behavior primitives.
//!
//! `gpui-base` supplies interaction, focus and accessibility; everything visual
//! here mirrors the shadcn styles of the Tauri front-end (`src/App.css`).

use std::rc::Rc;
use std::time::Duration;

use gpui::prelude::FluentBuilder;
use gpui::*;
use gpui_base::{
    Align, ElementExt as _, POPUP_PRIORITY, Placement, Positioner, Select, Tab, Tabs, Toggle,
};
use gpui_kit_assets::IconName;

gpui_kit_assets::icon_assets!(LucideAssets, [
    AudioLines, Check, ChevronDown, ChevronsUpDown, CircleCheck, CirclePlay, Download, File,
    FileUp, Monitor, Repeat, Search, Settings, TextWrap, Upload, Users, WholeWord, X,
]);

const HISTORY_ICON_PATH: &str = "icons/history.svg";
/// Lucide `history` (ISC), which this gpui-kit-assets catalog doesn't ship.
const HISTORY_ICON_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>"#;

/// Embedded icons: the Lucide subset above plus app-specific extras.
pub struct AppAssets;

impl AssetSource for AppAssets {
    fn load(&self, path: &str) -> Result<Option<std::borrow::Cow<'static, [u8]>>> {
        if path == HISTORY_ICON_PATH {
            return Ok(Some(std::borrow::Cow::Borrowed(HISTORY_ICON_SVG)));
        }
        LucideAssets.load(path)
    }

    fn list(&self, path: &str) -> Result<Vec<SharedString>> {
        let mut paths = LucideAssets.list(path)?;
        if HISTORY_ICON_PATH.starts_with(path) {
            paths.push(HISTORY_ICON_PATH.into());
        }
        Ok(paths)
    }
}

/// Colors resolved from the shadcn tokens in `src/App.css` (light theme).
pub mod colors {
    use gpui::{Hsla, Rgba, hsla, rgb};

    /// `--background`
    pub fn window() -> Rgba {
        rgb(0xffffff)
    }
    pub fn card() -> Rgba {
        rgb(0xffffff)
    }
    /// `--card`, used for the subtitles pane.
    pub fn right_pane() -> Rgba {
        rgb(0xf7f8f8)
    }
    /// `--foreground`
    pub fn text() -> Rgba {
        rgb(0x0f1419)
    }
    pub fn muted() -> Rgba {
        rgb(0x6b7076)
    }
    pub fn faint() -> Rgba {
        rgb(0x9aa0a6)
    }
    /// `--border`: primary at 20% over white.
    pub fn border() -> Rgba {
        rgb(0xd8e6fd)
    }
    /// `--muted`, the segmented-control track.
    pub fn track() -> Rgba {
        rgb(0xe5e5e7)
    }
    /// `--primary`
    pub fn accent() -> Rgba {
        rgb(0x3b82f6)
    }
    /// `--accent`: primary at 10% over white.
    pub fn accent_soft() -> Rgba {
        rgb(0xebf2fe)
    }
    pub fn accent_text() -> Rgba {
        rgb(0x3b82f6)
    }
    /// Filled control background (select triggers, option chips).
    pub fn control() -> Rgba {
        rgb(0xf1f2f3)
    }
    pub fn control_hover() -> Rgba {
        rgb(0xe8e9eb)
    }
    /// `--destructive`
    pub fn danger() -> Rgba {
        rgb(0xf4212f)
    }
    /// `border-muted-foreground/25` on the drop zone.
    pub fn dashed() -> Hsla {
        hsla(210. / 360., 0.25, 0.08, 0.25)
    }
    pub fn dashed_hover() -> Hsla {
        hsla(210. / 360., 0.25, 0.08, 0.4)
    }
}

pub fn icon(name: IconName) -> Svg {
    svg().path(name.path()).size_4().flex_none()
}

pub fn history_icon() -> Svg {
    svg().path(HISTORY_ICON_PATH).size_4().flex_none()
}

type ChangeHandler<T> = Rc<dyn Fn(T, &mut Window, &mut App)>;

/// Two-or-more option segmented control with a sliding thumb
/// (the shadcn `animated-tabs` in the Tauri app).
#[derive(IntoElement)]
pub struct SegmentedControl {
    id: ElementId,
    items: Vec<(IconName, SharedString)>,
    selected: usize,
    previous: usize,
    epoch: u32,
    on_change: Option<ChangeHandler<usize>>,
}

impl SegmentedControl {
    /// `previous` and `epoch` drive the slide animation: bump `epoch` whenever
    /// `selected` changes so the animation restarts from `previous`.
    pub fn new(id: impl Into<ElementId>, selected: usize, previous: usize, epoch: u32) -> Self {
        Self {
            id: id.into(),
            items: Vec::new(),
            selected,
            previous,
            epoch,
            on_change: None,
        }
    }

    pub fn item(mut self, icon: IconName, label: impl Into<SharedString>) -> Self {
        self.items.push((icon, label.into()));
        self
    }

    pub fn on_change(mut self, handler: impl Fn(usize, &mut Window, &mut App) + 'static) -> Self {
        self.on_change = Some(Rc::new(handler));
        self
    }
}

impl RenderOnce for SegmentedControl {
    fn render(self, _: &mut Window, _: &mut App) -> impl IntoElement {
        let count = self.items.len().max(1) as f32;
        let from = self.previous as f32 / count;
        let to = self.selected as f32 / count;
        let size = self.items.len();

        Tabs::new(self.id.clone())
            .relative()
            .flex()
            .h(px(36.))
            .p_1()
            .rounded(px(10.))
            .bg(colors::track())
            .child(
                // Thumb sits beneath the tab labels.
                div()
                    .absolute()
                    .top(px(4.))
                    .bottom(px(4.))
                    .w(relative(1. / count))
                    .px_1()
                    .child(div().size_full().rounded(px(7.)).bg(colors::card()).shadow_sm())
                    .with_animation(
                        ElementId::NamedInteger("segment-thumb".into(), self.epoch as u64),
                        Animation::new(Duration::from_millis(160)).with_easing(ease_in_out),
                        move |el, delta| el.left(relative(from + (to - from) * delta)),
                    ),
            )
            .children(self.items.into_iter().enumerate().map(|(ix, (icon_name, label))| {
                let selected = ix == self.selected;
                let on_change = self.on_change.clone();
                Tab::new(ix)
                    .selected(selected)
                    .set_position(ix + 1, size)
                    .flex_1()
                    .h(px(28.))
                    .flex()
                    .items_center()
                    .justify_center()
                    .gap_1p5()
                    .text_sm()
                    .cursor_pointer()
                    .text_color(if selected { colors::text() } else { colors::muted() })
                    .when(selected, |el| el.font_weight(FontWeight::MEDIUM))
                    .child(icon(icon_name).text_color(if selected {
                        colors::text()
                    } else {
                        colors::muted()
                    }))
                    .child(label)
                    .when_some(on_change.filter(|_| !selected), |el, on_change| {
                        el.on_click(move |_, window, cx| on_change(ix, window, cx))
                    })
            }))
    }
}

/// Dropdown select: filled trigger with a chevron, anchored option list.
#[derive(IntoElement)]
pub struct SelectMenu {
    id: SharedString,
    label: SharedString,
    options: Vec<SharedString>,
    selected: usize,
    open: bool,
    disabled: bool,
    width: Pixels,
    on_open_change: Option<ChangeHandler<bool>>,
    on_select: Option<ChangeHandler<usize>>,
}

impl SelectMenu {
    pub fn new(id: impl Into<SharedString>, label: impl Into<SharedString>) -> Self {
        Self {
            id: id.into(),
            label: label.into(),
            options: Vec::new(),
            selected: 0,
            open: false,
            disabled: false,
            width: px(220.),
            on_open_change: None,
            on_select: None,
        }
    }

    pub fn options(mut self, options: impl IntoIterator<Item = impl Into<SharedString>>) -> Self {
        self.options = options.into_iter().map(Into::into).collect();
        self
    }

    pub fn selected(mut self, selected: usize) -> Self {
        self.selected = selected;
        self
    }

    pub fn open(mut self, open: bool) -> Self {
        self.open = open;
        self
    }

    pub fn disabled(mut self, disabled: bool) -> Self {
        self.disabled = disabled;
        self
    }

    pub fn width(mut self, width: Pixels) -> Self {
        self.width = width;
        self
    }

    pub fn on_open_change(
        mut self,
        handler: impl Fn(bool, &mut Window, &mut App) + 'static,
    ) -> Self {
        self.on_open_change = Some(Rc::new(handler));
        self
    }

    pub fn on_select(mut self, handler: impl Fn(usize, &mut Window, &mut App) + 'static) -> Self {
        self.on_select = Some(Rc::new(handler));
        self
    }
}

const TRIGGER_HEIGHT: f32 = 36.;

impl RenderOnce for SelectMenu {
    fn render(self, window: &mut Window, cx: &mut App) -> impl IntoElement {
        let open = self.open && !self.disabled;
        let value = self.options.get(self.selected).cloned().unwrap_or_default();
        let noop: ChangeHandler<bool> = Rc::new(|_, _, _| {});
        let on_open_change = self.on_open_change.unwrap_or(noop);

        // Remember where the trigger is so a click on it while open is treated
        // as a toggle rather than an outside click.
        let trigger_bounds = window.use_keyed_state(
            (ElementId::Name(self.id.clone()), "trigger-bounds"),
            cx,
            |_, _| Bounds::<Pixels>::default(),
        );

        let trigger = div()
            .id(ElementId::Name(format!("{}-trigger", self.id).into()))
            .relative()
            .w(self.width)
            .h(px(TRIGGER_HEIGHT))
            .rounded(px(10.))
            .bg(colors::control())
            .text_sm()
            .text_color(if self.disabled { colors::faint() } else { colors::text() })
            .child(
                // Padding lives here so `on_prepaint` below measures the full trigger.
                div()
                    .size_full()
                    .px_3()
                    .flex()
                    .items_center()
                    .justify_between()
                    .gap_2()
                    .child(div().truncate().child(value.clone()))
                    .child(
                        icon(IconName::ChevronsUpDown)
                            .size(px(14.))
                            .text_color(colors::muted()),
                    ),
            )
            .when(!self.disabled, |el| {
                let on_open_change = on_open_change.clone();
                el.cursor_pointer()
                    .hover(|s| s.bg(colors::control_hover()))
                    .on_click(move |_, window, cx| on_open_change(!open, window, cx))
            })
            .on_prepaint({
                let trigger_bounds = trigger_bounds.clone();
                move |bounds, _, cx| trigger_bounds.update(cx, |b, _| *b = bounds)
            });

        let root = Select::new(ElementId::Name(self.id.clone()))
            .open(open)
            .disabled(self.disabled)
            .accessibility_label(self.label)
            .accessibility_value(value)
            .on_open_change({
                let on_open_change = on_open_change.clone();
                move |next, window, cx| on_open_change(next, window, cx)
            })
            .child(trigger);

        let anchor = *trigger_bounds.read(cx);
        let menu = div()
            .id("options")
            .w(self.width)
            .max_h(px(264.))
            .overflow_y_scroll()
            .p_1()
            .flex()
            .flex_col()
            .rounded(px(10.))
            .border_1()
            .border_color(colors::border())
            .bg(colors::card())
            .shadow_md()
            .on_mouse_down_out({
                let on_open_change = on_open_change.clone();
                move |event, window, cx| {
                    if !anchor.contains(&event.position) {
                        on_open_change(false, window, cx);
                    }
                }
            })
            .children(self.options.into_iter().enumerate().map(|(ix, option)| {
                let selected = ix == self.selected;
                let on_select = self.on_select.clone();
                let on_open_change = on_open_change.clone();
                div()
                    .id(ix)
                    .h(px(30.))
                    .px_2()
                    .flex()
                    .items_center()
                    .justify_between()
                    .rounded(px(6.))
                    .text_sm()
                    .text_color(colors::text())
                    .cursor_pointer()
                    .hover(|s| s.bg(colors::control()))
                    .child(option)
                    .when(selected, |el| {
                        el.child(icon(IconName::Check).size(px(14.)).text_color(colors::accent()))
                    })
                    .on_click(move |_, window, cx| {
                        if let Some(on_select) = &on_select {
                            on_select(ix, window, cx);
                        }
                        on_open_change(false, window, cx);
                    })
            }));

        // Below the trigger, flipping above when the window bottom is too close.
        root.when(open, |el| {
            el.child(
                deferred(
                    Positioner::side(anchor)
                        .placement(Placement::Bottom)
                        .align(Align::Start)
                        .offset(px(4.))
                        .margin(px(8.))
                        .occlude()
                        .child(menu),
                )
                .with_priority(POPUP_PRIORITY),
            )
        })
    }
}

/// Pressable chip for boolean options (VAD, speakers, …).
#[derive(IntoElement)]
pub struct ToggleChip {
    id: ElementId,
    icon: IconName,
    label: SharedString,
    pressed: bool,
    disabled: bool,
    on_change: Option<ChangeHandler<bool>>,
}

impl ToggleChip {
    pub fn new(id: impl Into<ElementId>, icon: IconName, label: impl Into<SharedString>) -> Self {
        Self {
            id: id.into(),
            icon,
            label: label.into(),
            pressed: false,
            disabled: false,
            on_change: None,
        }
    }

    pub fn pressed(mut self, pressed: bool) -> Self {
        self.pressed = pressed;
        self
    }

    pub fn disabled(mut self, disabled: bool) -> Self {
        self.disabled = disabled;
        self
    }

    pub fn on_change(mut self, handler: impl Fn(bool, &mut Window, &mut App) + 'static) -> Self {
        self.on_change = Some(Rc::new(handler));
        self
    }
}

impl RenderOnce for ToggleChip {
    fn render(self, _: &mut Window, _: &mut App) -> impl IntoElement {
        let fg = if self.pressed { colors::accent_text() } else { colors::muted() };
        Toggle::new(self.id)
            .pressed(self.pressed)
            .disabled(self.disabled)
            .accessibility_label(self.label.clone())
            .h(px(TRIGGER_HEIGHT))
            .px_2p5()
            .flex()
            .items_center()
            .gap_1()
            .rounded(px(10.))
            .border_1()
            .text_sm()
            .text_color(fg)
            .map(|el| {
                if self.pressed {
                    el.bg(colors::accent_soft())
                        .border_color(colors::border())
                        .font_weight(FontWeight::MEDIUM)
                } else {
                    el.bg(colors::control()).border_color(transparent_black())
                }
            })
            .map(|el| {
                if self.disabled {
                    el.opacity(0.5)
                } else {
                    el.cursor_pointer()
                }
            })
            .child(icon(self.icon).size(px(14.)).text_color(fg))
            .child(self.label)
            .when_some(self.on_change, |el, on_change| {
                el.on_change(move |next, _, window, cx| on_change(next, window, cx))
            })
    }
}
