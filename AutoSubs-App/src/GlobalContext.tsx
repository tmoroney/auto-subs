import { useEffect, createContext, useState, useContext, useRef } from 'react';
import { fetch } from '@tauri-apps/plugin-http';
import { readTextFile, exists, writeTextFile } from '@tauri-apps/plugin-fs';
import { join, downloadDir, appCacheDir, cacheDir } from '@tauri-apps/api/path';
import { open, save } from '@tauri-apps/plugin-dialog';
import { Subtitle, Speaker, TopSpeaker, EnabeledSteps, ErrorMsg, TimelineInfo, AudioInfo } from "@/types/interfaces";
import { load, Store } from '@tauri-apps/plugin-store';
import { Child, Command } from '@tauri-apps/plugin-shell';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { exit } from '@tauri-apps/plugin-process';
import { platform } from '@tauri-apps/plugin-os';

const DEFAULT_SETTINGS = {
    inputTrack: "0",
    outputTrack: "0",
    model: "small",
    language: "auto",
    translate: false,
    maxWords: 5,
    maxChars: 25,
    textFormat: "normal",
    removePunctuation: false,
    sensitiveWords: "",
    alignWords: false,
    diarizeSpeakerCount: 2,
    diarizeMode: "auto",
    enabledSteps: {
        exportAudio: true,
        transcribe: true,
        customSrt: false,
        textFormat: false,
        advancedOptions: false,
        diarize: false,
    }
};

let transcriptionProcess: Child | null = null;

interface GlobalContextProps {
    timelineInfo: TimelineInfo;
    inputTrack: string;
    outputTrack: string;
    currentTemplate: string;
    currentLanguage: string;
    model: string;
    translate: boolean;
    enabledSteps: EnabeledSteps;
    diarizeSpeakerCount: number;
    diarizeMode: string;
    maxWords: number;
    maxChars: number;
    textFormat: string;
    removePunctuation: boolean;
    sensitiveWords: string;
    alignWords: boolean;
    processingStep: string;
    isLoading: boolean;
    error: ErrorMsg;
    audioPath: string;
    currentStep: number;
    progress: number;
    subtitles: Subtitle[];
    setError: (errorMsg: ErrorMsg) => void
    setIsLoading: (newIsLoading: boolean) => void;
    setTemplate: (newTemplate: string) => void;
    setLanguage: (newLanguage: string) => void;
    setInputTrack: (newTrack: string) => void;
    setOutputTrack: (newTrack: string) => void;
    setModel: (newModel: string) => void;
    setTranslate: (newTranslate: boolean) => void;
    setDiarizeSpeakerCount: (newDiarizeSpeakerCount: number) => void;
    setDiarizeMode: (newDiarizeMode: string) => void;
    setMaxWords: (newMaxWords: number) => void;
    setMaxChars: (newMaxChars: number) => void;
    setTextFormat: (newTextFormat: string) => void;
    setRemovePunctuation: (newRemovePunctuation: boolean) => void;
    setSensitiveWords: (newSensitiveWords: string) => void;
    setAlignWords: (newAlignWords: boolean) => void;
    setEnabledSteps: (newEnabledSteps: EnabeledSteps) => void;
    runSteps: (useCachedAudio: boolean) => Promise<void>;
    resetSettings: () => void;
    setProgress: (newProgress: number) => void;

    speakers: Speaker[];
    topSpeaker: TopSpeaker;
    setSpeakers: (newSpeakers: Speaker[]) => void;
    updateSpeaker: (index: number, label: string, color: string, style: string) => Promise<void>
    getTimelineInfo: () => Promise<void>;
    populateSubtitles: (timelineId: string) => Promise<void>;
    addSubtitles: (filePath?: string) => Promise<void>;
    exportSubtitles: () => Promise<void>;
    importSubtitles: () => Promise<void>;
    jumpToTime: (start: number) => Promise<void>;
}

const resolveAPI = "http://localhost:55010/";
const transcribeAPI = "http://localhost:55000/transcribe/";
//const validateAPI = "http://localhost:55000/validate/";

let storageDir = '';

let store: Store | null = null;

const subtitleRegex = /\[\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}\.\d{3}\]\s+(.*)/;

const GlobalContext = createContext<GlobalContextProps | undefined>(undefined);

export function GlobalProvider({ children }: React.PropsWithChildren<{}>) {
    const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
    const [speakers, setSpeakers] = useState<Speaker[]>([]);
    const [topSpeaker, setTopSpeaker] = useState<TopSpeaker>({ label: "", id: "", percentage: 0 });
    const [isLoading, setIsLoading] = useState(true);
    const [processingStep, setProcessingStep] = useState("Starting Transcription Server...");
    const [error, setError] = useState<ErrorMsg>({ title: "", desc: "" });
    const [audioPath, setAudioPath] = useState("");
    const serverLoading = useRef(true);
    const [progress, setProgress] = useState(0);

    const [markIn, setMarkIn] = useState(0);
    const [markOut, setMarkOut] = useState(0);
    const [timelineInfo, setTimelineInfo] = useState<TimelineInfo>({ name: "", timelineId: "", templates: [], inputTracks: [], outputTracks: [] });
    const [currentTemplate, setTemplate] = useState("");
    const [outputTrack, setOutputTrack] = useState("");
    const [inputTrack, setInputTrack] = useState("");

    const [model, setModel] = useState(DEFAULT_SETTINGS.model);
    const [currentLanguage, setLanguage] = useState(DEFAULT_SETTINGS.language);
    const [translate, setTranslate] = useState(DEFAULT_SETTINGS.translate);
    const [diarizeSpeakerCount, setDiarizeSpeakerCount] = useState(DEFAULT_SETTINGS.diarizeSpeakerCount);
    const [diarizeMode, setDiarizeMode] = useState(DEFAULT_SETTINGS.diarizeMode);
    const [maxWords, setMaxWords] = useState(DEFAULT_SETTINGS.maxWords);
    const [maxChars, setMaxChars] = useState(DEFAULT_SETTINGS.maxChars);
    const [textFormat, setTextFormat] = useState(DEFAULT_SETTINGS.textFormat);
    const [removePunctuation, setRemovePunctuation] = useState(DEFAULT_SETTINGS.removePunctuation);
    const [sensitiveWords, setSensitiveWords] = useState<string>(DEFAULT_SETTINGS.sensitiveWords);
    const [alignWords, setAlignWords] = useState(DEFAULT_SETTINGS.alignWords);

    const [currentStep, setCurrentStep] = useState<number>(0);
    const [enabledSteps, setEnabledSteps] = useState<EnabeledSteps>(DEFAULT_SETTINGS.enabledSteps);

    async function setTranscriptsFolder() {
        if (platform() === 'windows') {
            storageDir = await join(await cacheDir(), "AutoSubs-Cache/Cache/transcripts");
        } else {
            storageDir = await join(await appCacheDir(), "transcripts");
        }
    }

    async function getFullTranscriptPath() {
        let filePath = await join(storageDir, `${timelineInfo.timelineId}.json`);
        return filePath;
    }

    function resetSettings() {
        store?.reset();
        setModel(DEFAULT_SETTINGS.model);
        setLanguage(DEFAULT_SETTINGS.language);
        setTemplate("");
        setInputTrack(DEFAULT_SETTINGS.inputTrack);
        setOutputTrack(DEFAULT_SETTINGS.outputTrack);
        setTranslate(DEFAULT_SETTINGS.translate);
        setMaxWords(DEFAULT_SETTINGS.maxWords);
        setMaxChars(DEFAULT_SETTINGS.maxChars);
        setTextFormat(DEFAULT_SETTINGS.textFormat);
        setRemovePunctuation(DEFAULT_SETTINGS.removePunctuation);
        setSensitiveWords(DEFAULT_SETTINGS.sensitiveWords);
        setAlignWords(DEFAULT_SETTINGS.alignWords);
        setEnabledSteps(DEFAULT_SETTINGS.enabledSteps);
        setDiarizeSpeakerCount(DEFAULT_SETTINGS.diarizeSpeakerCount);
        setDiarizeMode(DEFAULT_SETTINGS.diarizeMode);
    }

    async function initializeStore() {
        if (!store) {
            store = await load('autosubs-store.json', { autoSave: false });
        }

        try {
            setModel(await store.get<string>('model') || DEFAULT_SETTINGS.model);
            setLanguage(await store.get<string>('currentLanguage') || DEFAULT_SETTINGS.language);
            setTemplate(await store.get<string>('currentTemplate') || "");
            setInputTrack(await store.get<string>('inputTrack') || DEFAULT_SETTINGS.inputTrack);
            setOutputTrack(await store.get<string>('outputTrack') || DEFAULT_SETTINGS.outputTrack);
            setTranslate(await store.get<boolean>('translate') || DEFAULT_SETTINGS.translate);
            setMaxWords(await store.get<number>('maxWords') || DEFAULT_SETTINGS.maxWords);
            setMaxChars(await store.get<number>('maxChars') || DEFAULT_SETTINGS.maxChars);
            setTextFormat(await store.get<string>('textFormat') || DEFAULT_SETTINGS.textFormat);
            setRemovePunctuation(await store.get<boolean>('removePunctuation') || DEFAULT_SETTINGS.removePunctuation);
            setSensitiveWords(await store.get<string>('sensitiveWords') || DEFAULT_SETTINGS.sensitiveWords);
            setAlignWords(await store.get<boolean>('alignWords') || DEFAULT_SETTINGS.alignWords);
            setEnabledSteps(await store.get<EnabeledSteps>('enabledSteps') || DEFAULT_SETTINGS.enabledSteps);
            setDiarizeSpeakerCount(await store.get<number>('diarizeSpeakerCount') || DEFAULT_SETTINGS.diarizeSpeakerCount);
            setDiarizeMode(await store.get<string>('diarizeMode') || DEFAULT_SETTINGS.diarizeMode);
        } catch (error) {
            console.error('Error initializing store:', error);
        }
    }

    async function saveState() {
        if (store) {
            try {
                await store.set('model', model);
                await store.set('currentLanguage', currentLanguage);
                await store.set('currentTemplate', currentTemplate);
                await store.set('outputTrack', outputTrack);
                await store.set('inputTrack', inputTrack);
                await store.set('translate', translate);
                await store.set('maxWords', maxWords);
                await store.set('maxChars', maxChars);
                await store.set('textFormat', textFormat);
                await store.set('removePunctuation', removePunctuation);
                await store.set('sensitiveWords', sensitiveWords);
                await store.set('alignWords', alignWords);
                await store.set('enabledSteps', enabledSteps);
                await store.set('diarizeSpeakerCount', diarizeSpeakerCount);
                await store.set('diarizeMode', diarizeMode);
                await store.save(); // Persist changes
            } catch (error) {
                console.error('Error saving state:', error);
            }
        }
    }

    useEffect(() => {
        saveState();
    }, [model, currentLanguage, currentTemplate, inputTrack, outputTrack, translate, maxWords, maxChars, textFormat, removePunctuation, sensitiveWords, alignWords, enabledSteps, diarizeSpeakerCount, diarizeMode]);

    async function startTranscriptionServer() {
        try {
            // Create the command without using 'open' or shell-specific arguments
            let command;
            if (platform() === 'windows') {
                command = Command.create('transcription-server-win');
            } else if (platform() === 'macos')
                command = Command.create('transcription-server-mac')
            else {
                return;
            }

            // Set up event listeners for logging
            command.on('close', (data) => {
                console.log(`Transcription server exited with code ${data.code} and signal ${data.signal}`);
            });

            command.on('error', (error) => {
                console.error(`Transcription server encountered an error: "${error}"`);
            });

            command.stdout.on('data', (line) => {
                const match = line.match(subtitleRegex);
                if (match && match[1]) {
                    let result = match[1].replace(/"/g, '').trim()
                    let subtitle = { text: result, start: "", end: "", speaker: "" };
                    setSubtitles(prevSubtitles => [subtitle, ...prevSubtitles]);
                    setProcessingStep("Transcribing Audio...");
                } else if (line.includes('Progress:')) {
                    const percentageMatch = line.match(/(\d+)%/);
                    if (percentageMatch && percentageMatch[1]) {
                        const percentage = parseInt(percentageMatch[1], 10);
                        if (enabledSteps.diarize) {
                            setProgress(30 + (percentage / 100 * 30));
                        }
                        else {
                            setProgress(30 + (percentage / 100 * 60));
                        }
                        setProcessingStep(`Transcribing Audio... ${percentage}%`); // Update the state
                    }
                } else {
                    console.log(`Transcription Server STDOUT: "${line}"`);
                }
            });

            command.stderr.on('data', (line) => {
                // Check if the message is an informational message
                if (line == "" || line.length < 1) {
                    return;
                }
                else if (line.includes('Adjustment:') || line.includes('Aligning:')) {
                    setProcessingStep(`Adjusting Timing...`); // Update the state
                }
                else if ((line.includes('address already in use') || line.includes('Uvicorn running') || line.includes('one usage of each socket') || line.includes("Failed to load Python shared library")) && serverLoading.current) {
                    setProcessingStep("");
                    setIsLoading(false);
                    serverLoading.current = false;
                }
                else if (line.includes('INFO:') || line.includes('VAD') || line.includes('Adjustment')) {
                    if (line.includes('speechbrain')) {
                        setProcessingStep("Diarizing speakers...");
                        setCurrentStep(3);
                        setProgress(60);
                        setIsLoading(true);
                    } else {
                        console.log(`Transcription Server INFO: "${line}"`);
                    }
                } else if (line.includes("model.bin:") || line.includes("weights.safetensors:")) {
                    const percentageMatch = line.match(/(\d+)%/);
                    if (percentageMatch && percentageMatch[1]) {
                        const percentage = parseInt(percentageMatch[1], 10);
                        setProcessingStep(`Downloading Model... ${percentage}%`); // Update the state
                        setCurrentStep(2);
                        setProgress(20 + (percentage / 100 * 10));
                    }
                } else if (line.includes("download")) {
                    setProcessingStep("Downloading Model..."); // Update the state
                } else {
                    console.error(`Transcription Server STDERR: "${line}"`);
                }
            });

            console.log('Starting transcription server...');
            // Assign the spawned process to the global variable
            transcriptionProcess = await command.spawn();
            console.log('Transcription server started with PID:', transcriptionProcess.pid);
        } catch (error) {
            console.error("Failed to start the transcription server:", error);
        }
    }

    async function stopTranscriptionServer() {
        try {
            if (transcriptionProcess) {
                console.log('Stopping transcription server...');
                await transcriptionProcess.kill();
                console.log('Transcription server stopped');
            }
        }
        catch (error) {
            console.error("Failed to stop the transcription server:", error);
        }
    }

    async function runSteps(useCachedAudio: boolean) {
        // To-do: Add ability to re-run specific step - not only cached audio
        setIsLoading(true);
        setSubtitles([]);
        setProgress(5);

        let audioInfo: AudioInfo = {
            timeline: timelineInfo.timelineId,
            path: audioPath,
            markIn: markIn,
            markOut: markOut
        };

        if (enabledSteps.exportAudio && !useCachedAudio && !enabledSteps.customSrt) {
            setCurrentStep(1);
            audioInfo = await exportAudio();
        }

        setProgress(20);
        let filePath;
        if (enabledSteps.transcribe && !enabledSteps.customSrt) {
            setCurrentStep(2);
            filePath = await fetchTranscription(audioInfo);
        }

        // TODO: skip transcription if custom srt is enabled
        // TODO: send request to modify subtitles if only text format is re-run

        setProgress(90);
        setCurrentStep(7);

        setProcessingStep("Populating timeline...");
        await populateSubtitles(timelineInfo.timelineId);
        await addSubtitles(filePath);

        setProgress(100);
        setIsLoading(false);
    }

    async function exportAudio() {
        // send request to Lua server (Resolve)
        setProcessingStep("Exporting Audio...");
        const response = await fetch(resolveAPI, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                func: "ExportAudio",
                outputDir: await downloadDir(),
                inputTrack: inputTrack,
            }),
        });

        const data: AudioInfo = await response.json();
        if (data.timeline == "") {
            throw new Error("Failed to export audio. You must have a timeline open in Resolve to start transcribing.");
        }

        setAudioPath(await join(await downloadDir(), "autosubs-exported-audio.wav"));
        setMarkIn(data.markIn);
        setMarkOut(data.markOut);

        return data;
    };

    async function fetchTranscription(audioInfo: AudioInfo) {
        try {
            const sensitiveWordsList = sensitiveWords && enabledSteps.textFormat
                ? sensitiveWords.split(',').map(word => word.trim().toLowerCase())
                : [];

            const body = {
                file_path: await join(await downloadDir(), "autosubs-exported-audio.wav"),
                output_dir: storageDir,
                timeline: timelineInfo.timelineId,
                model,
                language: currentLanguage,
                task: translate ? "translate" : "transcribe",
                diarize: enabledSteps.diarize,
                diarize_speaker_count: diarizeSpeakerCount,
                align_words: enabledSteps.advancedOptions && alignWords,
                max_words: maxWords,
                max_chars: maxChars,
                sensitive_words: sensitiveWordsList,
                mark_in: audioInfo.markIn,
                mark_out: audioInfo.markOut,
            };

            const response = await fetch(transcribeAPI, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                throw new Error((await response.json().catch(() => ({}))).detail || `HTTP error! status: ${response.status}`);
            }

            let data = await response.json();
            return data.result_file;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            setError({ title: "Transcription Error", desc: errorMessage });
            console.error("Error fetching transcription:", errorMessage);
        }
    }

    async function addSubtitles(filePath?: string) {
        if (!filePath) {
            await updateTranscript(speakers);
            filePath = await getFullTranscriptPath();
        }

        try {
            const response = await fetch(resolveAPI, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    func: "AddSubtitles",
                    filePath,
                    templateName: currentTemplate,
                    trackIndex: outputTrack,
                    removePunctuation: enabledSteps.textFormat && removePunctuation,
                    textFormat: enabledSteps.textFormat && textFormat,
                }),
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const data = await response.json();
            console.log(data);
        } catch (error) {
            console.error('Error adding subtitles:', error);
            setError({
                title: "Error Adding Subtitles",
                desc: "Open the console in Resolve to see the error message (Workspace -> Console)."
            });
        }
    }

    async function getTimelineInfo() {
        try {
            const response = await fetch(resolveAPI, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ func: "GetTimelineInfo" }),
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const data = await response.json();
            if (data.timelineId == "") {
                setError({
                    title: "No Timeline Detected",
                    desc: "You need to open a timeline in Resolve to start transcribing."
                });
                return;
            }
            setTimelineInfo(data);
            return data.timelineId;
        } catch (error) {
            console.error('Error fetching timeline info (failed to connect to AutoSubs Link in Resolve):', error);
            setError({
                title: "Failed to connect to Resolve",
                desc: "Make sure to open AutoSubs via the Workspace -> Scripts menu inside Resolve."
            });
        }
    }

    async function jumpToTime(start: number) {
        try {
            const response = await fetch(resolveAPI, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ func: "JumpToTime", start, markIn }),
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const data = await response.json();
            console.log(data);
        } catch (error) {
            console.error('Error jumping to time:', error);
            //setError("Failed to connect to Resolve. Open AutoSubs via the Workspace -> Scripts menu inside Resolve.")
            setError({
                title: "Failed to connect to Resolve",
                desc: "Make sure to open AutoSubs via the Workspace -> Scripts menu inside Resolve."
            });
        }
    }

    async function readTranscript(timeLineId: string) {
        const filePath = await join(storageDir, `${timeLineId}.json`);

        try {
            // Check if the file exists
            const fileExists = await exists(filePath);

            if (!fileExists) {
                console.log("Transcript file does not exist for this timeline.");
                return;
            }

            // Read JSON file
            console.log("Reading json file...");
            const contents = await readTextFile(filePath);
            let transcript = JSON.parse(contents);
            return transcript;
        } catch (error) {
            setError({
                title: "Error reading transcript",
                desc: "Failed to read the transcript file:" + error
            })
        }
    }

    async function populateSubtitles(timelineId: string) {
        console.log("Populating subtitles...", timelineId);
        let transcript = await readTranscript(timelineId);
        if (transcript) {
            setMarkIn(transcript.mark_in)
            setSubtitles(transcript.segments);
            setSpeakers(transcript.speakers);
            setTopSpeaker(transcript.top_speaker);
        }
    }

    /**
    * Converts seconds to SRT timecode format (HH:mm:ss,SSS).
    * @param seconds Time in seconds to be converted.
    * @returns A formatted timecode string.
    */
    function formatTimecode(seconds: number): string {
        const ms = Math.floor((seconds % 1) * 1000);
        const totalSeconds = Math.floor(seconds);
        const s = totalSeconds % 60;
        const m = Math.floor((totalSeconds / 60) % 60);
        const h = Math.floor(totalSeconds / 3600);

        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
    }

    /**
     * Converts an array of subtitles into an SRT-formatted string.
     * @returns A string formatted as an SRT file.
     */
    function generateSrt(): string {
        return subtitles.map((subtitle, index) => {
            // Format each subtitle into the SRT format
            return [
                (index + 1).toString(), // Subtitle index
                `${formatTimecode(Number(subtitle.start))} --> ${formatTimecode(Number(subtitle.end))}`, // Time range
                subtitle.text.trim(),
                "" // Empty line after each block
            ].join("\n");
        }).join("\n");
    }

    async function exportSubtitles() {
        try {
            const filePath = await save({
                defaultPath: 'subtitles.srt',
                filters: [{ name: 'SRT Files', extensions: ['srt'] }],
            });

            if (!filePath) {
                console.log('Save was canceled');
                return;
            }

            let srtData = generateSrt()
            await writeTextFile(filePath, srtData);
            console.log('File saved to', filePath);
        } catch (error) {
            console.error('Failed to save file', error);
        }
    }

    async function importSubtitles() {
        try {
            const transcriptPath = await open({
                multiple: false,
                directory: false,
                filters: [{
                    name: 'SRT Files',
                    extensions: ['srt']
                }],
                defaultPath: await downloadDir()
            });

            if (!transcriptPath) {
                console.log('Open was canceled');
                return;
            }

            // read srt file and convert to json
            const srtData = await readTextFile(transcriptPath);
            const srtLines = srtData.split('\n');
            let subtitles: Subtitle[] = [];

            // convert srt to [{start, end, text}]
            for (let i = 0; i < srtLines.length; i++) {
                if (srtLines[i].match(/\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/)) {
                    let start = srtLines[i].split(' --> ')[0];
                    let end = srtLines[i].split(' --> ')[1];
                    let text = srtLines[i + 1];

                    const [startHours, startMinutes, startSeconds] = start.split(':');
                    const [startSecs, startMillis] = startSeconds.split(',');
                    const startInSeconds = parseInt(startHours) * 3600 + parseInt(startMinutes) * 60 + parseInt(startSecs) + parseInt(startMillis) / 1000;

                    const [endHours, endMinutes, endSeconds] = end.split(':');
                    const [endSecs, endMillis] = endSeconds.split(',');
                    const endInSeconds = parseInt(endHours) * 3600 + parseInt(endMinutes) * 60 + parseInt(endSecs) + parseInt(endMillis) / 1000;

                    let subtitle = { start: startInSeconds.toString(), end: endInSeconds.toString(), text, speaker: "" };
                    subtitles.push(subtitle);
                }
            }

            setSubtitles(subtitles);

            let transcript = {
                "segments": subtitles,
                "speakers": [],
            }

            // write to json file
            await writeTextFile(await join(storageDir, `${timelineInfo.timelineId}.json`), JSON.stringify(transcript, null, 2));
        } catch (error) {
            console.error('Failed to open file', error);
            setError({
                title: "Error Opening SRT File",
                desc: "Failed to open the SRT file. Please try again."
            });
        }
    }

    async function updateTranscript(speakers?: Speaker[], topSpeaker?: TopSpeaker, subtitles?: Subtitle[]) {
        if (!speakers && !subtitles) {
            return;
        }
        // read current file
        let transcript = await readTranscript(timelineInfo.timelineId);
        if (topSpeaker) {
            transcript.top_speaker = topSpeaker;
        }
        if (speakers) {
            transcript.speakers = speakers;
        }
        if (subtitles) {
            transcript.segments = subtitles;
        }

        // write to file
        const filePath = await join(storageDir, `${timelineInfo.timelineId}.json`);
        return await writeTextFile(filePath, JSON.stringify(transcript, null, 2));
    }

    async function updateSpeaker(index: number, label: string, color: string, style: string) {
        let newTopSpeaker = topSpeaker;
        if (topSpeaker.id === speakers[index].id) {
            newTopSpeaker = { ...topSpeaker, label };
            setTopSpeaker(newTopSpeaker); // Update the state
        }

        const newSpeakers = [...speakers];
        newSpeakers[index].label = label;
        newSpeakers[index].color = color;
        newSpeakers[index].style = style;

        setSpeakers(newSpeakers);
        await updateTranscript(newSpeakers, newTopSpeaker); // Use updated newTopSpeaker
    }

    useEffect(() => {
        if (timelineInfo.timelineId !== "" && timelineInfo.timelineId !== undefined) {
            populateSubtitles(timelineInfo.timelineId);
        }
    }, [timelineInfo]);

    const hasInitialized = useRef(false);

    useEffect(() => {
        setTranscriptsFolder();

        // Prevents the effect from running again on subsequent renders
        if (!hasInitialized.current) {
            startTranscriptionServer();
            hasInitialized.current = true;
        }

        initializeStore();

        getTimelineInfo();

        getCurrentWindow().once("tauri://close-requested", async () => {
            try {
                console.log("Stopping transcription server...");
                await stopTranscriptionServer();
            } catch (error) {
                console.warn("Failed to stop transcription server:", error);
            }

            console.log("Exiting...");

            try {
                await fetch(resolveAPI, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ func: "Exit" }),
                });
            } catch {
                // Swallow errors silently, as requested
            }

            exit(0);
        });
    }, []);

    return (
        <GlobalContext.Provider
            value={{
                timelineInfo,
                subtitles,
                speakers,
                topSpeaker,
                inputTrack,
                outputTrack,
                currentTemplate,
                currentLanguage,
                model,
                translate,
                currentStep,
                enabledSteps,
                diarizeSpeakerCount,
                diarizeMode,
                maxWords,
                maxChars,
                textFormat,
                removePunctuation,
                processingStep,
                sensitiveWords,
                alignWords,
                isLoading,
                error,
                audioPath,
                progress,
                setError,
                setIsLoading,
                setModel,
                setTranslate,
                setEnabledSteps,
                setDiarizeSpeakerCount,
                setDiarizeMode,
                setMaxWords,
                setMaxChars,
                setTextFormat,
                setRemovePunctuation,
                setSensitiveWords,
                setAlignWords,
                setTemplate,
                setLanguage,
                setInputTrack,
                setOutputTrack,
                runSteps,
                setSpeakers,
                updateSpeaker,
                getTimelineInfo,
                populateSubtitles,
                addSubtitles,
                exportSubtitles,
                importSubtitles,
                jumpToTime,
                resetSettings,
                setProgress
            }}
        >
            {children}
        </GlobalContext.Provider>
    );
}

export const useGlobal = () => {
    const context = useContext(GlobalContext);
    if (context === undefined) {
        throw new Error('useGlobal must be used within a GlobalProvider');
    }
    return context;
};