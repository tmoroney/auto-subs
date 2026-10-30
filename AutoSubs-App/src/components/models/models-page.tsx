import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ask } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import {
  ArrowUpDown,
  BookOpen,
  Download,
  Globe2,
  Search,
  Target,
  Trash2,
  Zap,
} from "lucide-react";
import { Button, Menu, MenuPopup, MenuRadioItem, Segmented } from "@/components/kit";
import { BackLink } from "@/components/back-link";
import { useModels } from "@/contexts/ModelsContext";
import { useProgress } from "@/contexts/ProgressContext";
import { useErrorDialog } from "@/contexts/ErrorDialogContext";
import { useSettingsStore } from "@/stores/settings-store";
import {
  alignerModel,
  compareModels,
  diarizeModel,
  diarizeSortformerModel,
  downloadedAuxiliaryModels,
  sortedModelsForLanguage,
  type ModelSort,
} from "@/lib/models";
import { languages } from "@/lib/languages";
import type { Model } from "@/types";

type Props = {
  onBack: () => void;
};

type ModelRowProps = {
  model: Model;
  selected: boolean;
  best: boolean;
  downloading: boolean;
  progress: number;
  disabled: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDownload: () => void;
};

type AddonRowProps = {
  model: Model;
  downloaded: boolean;
  unused: boolean;
  onDelete: () => void;
};

function formatRam(ramMb: number) {
  return ramMb >= 1024
    ? `${Math.round((ramMb / 1024) * 10) / 10}GB`
    : `${ramMb}MB`;
}

function Meter({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Target;
  value: number | null;
  label: string;
}) {
  if (value === null) return null;

  return (
    <div className="as-model-meter" title={label}>
      <Icon size={13} />
      <span>
        {[1, 2, 3, 4, 5].map((segment) => {
          const fill = Math.max(0, Math.min(1, value - segment + 1)) * 100;
          return (
            <i
              key={segment}
              style={{ "--fill": `${fill}%` } as React.CSSProperties}
            />
          );
        })}
      </span>
    </div>
  );
}

function ModelRow({
  model,
  selected,
  best,
  downloading,
  progress,
  disabled,
  onSelect,
  onDelete,
  onDownload,
}: ModelRowProps) {
  const { t } = useTranslation();
  const support =
    model.languageSupport.kind === "multilingual"
      ? t("redesign.languages99")
      : model.languageSupport.kind === "restricted"
        ? t("redesign.languageCount", {
            number: model.languageSupport.languages.length,
        })
        : t(model.badge);
  const progressStyle = downloading
    ? {
        background: `linear-gradient(
          90deg,
          color-mix(in srgb, var(--as-primary) 22%, var(--as-card)) ${progress}%,
          var(--as-card) ${progress}%
        )`,
      }
    : undefined;

  return (
    <div
      role="button"
      aria-pressed={selected}
      tabIndex={0}
      className={`as-model-row${selected ? " is-selected" : ""}`}
      onKeyDown={(event) => {
        if (
          event.target === event.currentTarget &&
          (event.key === "Enter" || event.key === " ")
        ) {
          event.preventDefault();
          onSelect();
        }
      }}
      onClick={onSelect}
    >
      <span className="as-model-radio" />
      <span className="as-model-name">
        <span className="as-model-label">{t(model.label)}</span>
        {best && <span className="as-best-pick">{t("models.bestPick")}</span>}
        <span className="as-model-ram">
          {t("modelStatus.ramShort", { size: formatRam(model.ramMb) })}
        </span>
      </span>
      <span className="as-model-tags">
        <span>
          <Globe2 size={12} />
          {support}
        </span>
        {model.engine === "whisper" && (
          <span>
            <BookOpen size={12} />
            {t("redesign.namesTerms")}
          </span>
        )}
      </span>
      <span
        className="as-model-action"
        onClick={(event) => event.stopPropagation()}
      >
        {model.isDownloaded ? (
          <Button
            variant="icon"
            aria-label={t("models.manage.deleteModel")}
            onClick={onDelete}
          >
            <Trash2 size={15} />
          </Button>
        ) : (
          <Button
            className="as-download-pill"
            style={progressStyle}
            disabled={disabled}
            onClick={onDownload}
          >
            {downloading ? (
              `${progress}%`
            ) : (
              <>
                <Download size={13} />
                {model.size}
              </>
            )}
          </Button>
        )}
      </span>
      <span className="as-model-meters">
        <Meter
          icon={Target}
          value={model.accuracy}
          label={t("models.filters.accuracy")}
        />
        <Meter
          icon={Zap}
          value={model.speed}
          label={t("models.filters.speed")}
        />
      </span>
    </div>
  );
}

function AddonRow({ model, downloaded, unused, onDelete }: AddonRowProps) {
  const { t } = useTranslation();
  const description = [
    model.size,
    model.licenseText?.summary ? t(model.licenseText.summary) : null,
    downloaded && unused ? t("models.manage.unused") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="as-setting-row">
      <div>
        <div className="as-setting-title">{t(model.label)}</div>
        <div className="as-setting-description">{description}</div>
      </div>
      <div>
        {downloaded ? (
          <Button
            variant="icon"
            aria-label={t("models.manage.deleteModel")}
            onClick={onDelete}
          >
            <Trash2 size={15} />
          </Button>
        ) : (
          <span className="as-addon-availability">
            {t("redesign.downloadsFirstUse", "Downloads when first used")}
          </span>
        )}
      </div>
    </div>
  );
}

export function ModelsPage({ onBack }: Props) {
  const { t } = useTranslation();
  const {
    modelsState,
    downloadedModelValues,
    checkDownloadedModels,
    handleDeleteModel,
  } = useModels();
  const modelIndex = useSettingsStore((state) => state.model);
  const language = useSettingsStore((state) => state.language);
  const maxSpeakers = useSettingsStore((state) => state.maxSpeakers);
  const diarizeBackend = useSettingsStore((state) => state.diarizeBackend);
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const { isRunActive } = useProgress();
  const { showError } = useErrorDialog();
  const [filter, setFilter] = React.useState("language");
  const [sort, setSort] = React.useState<ModelSort>("recommended");
  const [search, setSearch] = React.useState("");
  const [downloading, setDownloading] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState(0);
  const downloadLock = React.useRef(false);

  const languageLabel =
    language === "auto"
      ? t("redesign.autoDetect", "Auto-detect")
      : languages.find((item) => item.value === language)?.label ?? language;
  const visibleModels = React.useMemo(() => {
    const sorted =
      filter === "language"
        ? sortedModelsForLanguage(language, sort, modelsState)
        : [...modelsState].sort((a, b) => compareModels(a, b, language, sort));
    const query = search.trim().toLowerCase();

    return sorted.filter(
      (model) =>
        (filter !== "downloaded" || model.isDownloaded) &&
        [
          t(model.label),
          t(model.description),
          t(model.badge),
        ].some((value) => value.toLowerCase().includes(query)),
    );
  }, [filter, language, modelsState, search, sort, t]);
  const filterCounts = {
    language: sortedModelsForLanguage(language, sort, modelsState).length,
    downloaded: modelsState.filter((model) => model.isDownloaded).length,
    all: modelsState.length,
  };

  const download = async (model: Model) => {
    if (downloadLock.current || isRunActive) return;

    downloadLock.current = true;
    setDownloading(model.value);
    setProgress(0);
    let unlisten: (() => void) | undefined;

    try {
      unlisten = await listen<{ progress: number }>(
        "labeled-progress",
        (event) => setProgress(event.payload.progress),
      );
      await invoke("ensure_models", {
        request: {
          model: model.value,
          enableVad: false,
          enableDiarize: false,
          enableForcedAlignment: false,
        },
      });
      await checkDownloadedModels();
    } catch (error) {
      console.error("Model download failed", error);
      showError({
        title: t("models.manage.title"),
        message: t("models.downloadError", "Could not download model"),
        detail: String(error),
      });
    } finally {
      unlisten?.();
      downloadLock.current = false;
      setDownloading(null);
    }
  };
  const remove = async (model: Model) => {
    const confirmed = await ask(
      t("models.manage.confirmBody", { model: t(model.label) }),
      { title: t("models.manage.confirmTitle"), kind: "warning" },
    );
    if (confirmed) await handleDeleteModel(model.value);
  };
  const auxiliary = downloadedAuxiliaryModels(
    downloadedModelValues,
    maxSpeakers,
    diarizeBackend,
  );
  const addons = [
    diarizeSortformerModel,
    ...(downloadedModelValues.includes(diarizeModel.value) ? [diarizeModel] : []),
    alignerModel,
  ];

  return (
    <div className="as-content-page as-models-page">
      <BackLink onBack={onBack} />
      <h1 className="as-content-title">{t("models.manage.title")}</h1>
      <p className="as-page-meta">
        {t(
          "redesign.modelsIntro",
          "Runs on this device. Pick the one that understands your audio best.",
        )}
      </p>
      <label className="as-model-search">
        <Search size={16} />
        <input
          aria-label={t("models.searchPlaceholder")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("models.searchPlaceholder")}
        />
      </label>
      <div className="as-model-filters">
        <Segmented
          ariaLabel={t("models.filters.search")}
          value={filter}
          onValueChange={setFilter}
          options={[
            {
              value: "language",
              label: `${languageLabel} ${filterCounts.language}`,
            },
            {
              value: "downloaded",
              label: `${t("models.filterDownloaded", "Downloaded")} ${filterCounts.downloaded}`,
            },
            {
              value: "all",
              label: `${t("models.filterAll", "All")} ${filterCounts.all}`,
            },
          ]}
        />
        <Menu.Root>
          <Menu.Trigger className="as-sort-trigger">
            <ArrowUpDown size={14} />
            <span className="as-sort-label">
              {t(`models.filters.${sort}`)}
            </span>
          </Menu.Trigger>
          <MenuPopup className="as-sort-menu">
            <Menu.RadioGroup
              value={sort}
              onValueChange={(value) => setSort(value as ModelSort)}
            >
              {(["recommended", "accuracy", "speed"] as ModelSort[]).map(
                (value) => (
                  <MenuRadioItem key={value} value={value}>
                    {t(`models.filters.${value}`)}
                  </MenuRadioItem>
                ),
              )}
            </Menu.RadioGroup>
          </MenuPopup>
        </Menu.Root>
      </div>
      <div className="as-model-list">
        {visibleModels.map((model, index) => (
          <ModelRow
            key={model.value}
            model={model}
            selected={modelIndex === modelsState.indexOf(model)}
            best={sort === "recommended" && !search && index === 0}
            downloading={downloading === model.value}
            progress={progress}
            disabled={Boolean(downloading) || isRunActive}
            onSelect={() =>
              updateSetting("model", modelsState.indexOf(model))
            }
            onDelete={() => void remove(model)}
            onDownload={() => void download(model)}
          />
        ))}
      </div>
      <section className="as-settings-group as-addons">
        <h2>{t("redesign.addons", "Add-ons")}</h2>
        {addons.map((model) => {
          const downloaded = downloadedModelValues.includes(model.value);
          const status = auxiliary.find((item) => item.value === model.value);

          return (
            <AddonRow
              key={model.value}
              model={model}
              downloaded={downloaded}
              unused={status?.unused ?? false}
              onDelete={() => void remove(model)}
            />
          );
        })}
      </section>
    </div>
  );
}
