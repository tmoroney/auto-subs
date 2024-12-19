import { useEffect, createContext, useState, useContext, useRef } from 'react';
import { fetch } from '@tauri-apps/plugin-http';
import { BaseDirectory, readTextFile, exists, writeTextFile } from '@tauri-apps/plugin-fs';
import { join, downloadDir, appCacheDir, cacheDir } from '@tauri-apps/api/path';
import { save } from '@tauri-apps/plugin-dialog';
import { Subtitle, Speaker, TopSpeaker, EnabeledSteps, ErrorMsg, TimelineInfo } from "@/types/interfaces";
import { load, Store } from '@tauri-apps/plugin-store';
import { Child, Command } from '@tauri-apps/plugin-shell';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { exit } from '@tauri-apps/plugin-process';
import { platform } from '@tauri-apps/plugin-os';

const DEFAULT_SETTINGS = {
    model: "small",
    language: "auto",
    translate: false,
    maxWords: 6,
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
        textFormat: false,
        advancedOptions: false,
        diarize: false
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
    fetchTranscription: (audioPath: string) => Promise<void>;
    resetSettings: () => void;
    setProgress: (newProgress: number) => void;

    speakers: Speaker[];
    topSpeaker: TopSpeaker;
    setSpeakers: (newSpeakers: Speaker[]) => void;
    updateSpeaker: (index: number, label: string, color: string, style: string) => Promise<void>
    getTimelineInfo: () => Promise<void>;
    populateSubtitles: () => Promise<void>;
    addSubtitles: (filePath?: string) => Promise<void>;
    exportSubtitles: () => Promise<void>;
    initialize: () => void;
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
        setOutputTrack("");
        setInputTrack("");
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
            setOutputTrack(await store.get<string>('currentTrack') || "");
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
                else if ((line.includes('address already in use') || line.includes('Uvicorn running') || line.includes('one usage of each socket')) && serverLoading.current) {
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

    async function fetchTranscription(audioPath: string) {
        setIsLoading(true);
        setSubtitles([]);
        try {
            setProgress(5);
            setCurrentStep(1);
            let audioInfo = await exportAudio(audioPath);
            setProgress(20);
            console.log("Fetching transcription...");
            setProcessingStep("Preparing to transcribe...");
            setCurrentStep(2);

            console.log("Audio Path: ", audioInfo.path);
            let sensitiveWordsList: string[] = [];
            if (sensitiveWords !== "" && enabledSteps.textFormat) {
                sensitiveWordsList = sensitiveWords.split(',').map((word: string) => word.trim().toLowerCase());
            }

            let body = {
                file_path: audioInfo.path,
                output_dir: storageDir,
                timeline: timelineInfo.timelineId,
                model: model,
                language: currentLanguage,
                task: translate ? "translate" : "transcribe",
                diarize: enabledSteps.diarize,
                diarize_speaker_count: diarizeSpeakerCount,
                align_words: enabledSteps.advancedOptions && alignWords,
                max_words: maxWords,
                max_chars: maxChars,
                sensitive_words: sensitiveWordsList,
                mark_in: audioInfo.markIn
            };

            console.log(body);

            // Make the POST request to the transcription API
            const response = await fetch(transcribeAPI, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });

            // Check if the response is not successful
            if (!response.ok) {
                let errorMessage = `HTTP error! status: ${response.status}`;
                try {
                    // Attempt to parse the error message from the response
                    const errorData = await response.json();
                    if (errorData.detail) {
                        errorMessage = errorData.detail;
                    }
                } catch (jsonError) {
                    // If parsing fails, retain the default error message
                    console.error("Failed to parse error response as JSON:", jsonError);
                }
                // Set the error state with the extracted or default message
                setError({
                    title: "Transcription Error",
                    desc: errorMessage
                });
                // Throw an error to be caught in the catch block
                throw new Error(errorMessage);
            }

            setProgress(90);
            setCurrentStep(5);

            // If the response is successful, parse the JSON data
            const data = await response.json();
            const filePath = data.result_file;

            // Proceed with processing the transcription result
            setProcessingStep("Populating timeline...");
            setSubtitles([]);
            await populateSubtitles();
            await addSubtitles(filePath);
            setProgress(100);

        } catch (error: unknown) { // Explicitly type 'error' as 'unknown'
            // Handle any errors that occurred during the fetch or processing
            console.error("Error fetching transcription:", error);

            let errorMessage: string;
            // Type guard: Check if 'error' is an instance of Error
            if (error instanceof Error) {
                errorMessage = error.message;
            } else {
                errorMessage = String(error);
            }

            // Update the error state with the appropriate message
            setError({
                title: "Transcription Error",
                desc: errorMessage
            });

        } finally {
            // Ensure that the loading state is reset regardless of success or failure
            console.log("Finished transcribing.");
            setIsLoading(false);
        }
    }

    async function exportAudio(prevAudioPath: string) {
        if (prevAudioPath !== "") {
            return {
                path: audioPath,
                markIn: markIn,
                markOut: markOut
            };
        }
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

        const data = await response.json();

        if (data.timeline == "") {
            throw new Error("Failed to export audio. You must have a timeline open in Resolve to start transcribing.");
        }

        setAudioPath(data.path);
        setMarkIn(data.markIn);
        setMarkOut(data.markOut);

        return data;
    };

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
                    markIn,
                    markOut,
                }),
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const data = await response.json();
            console.log(data);
        } catch (error) {
            console.error('Error adding subtitles:', error);
            //setError("Error adding subtitles - Open the console in Resolve to see the error message (Workspace -> Console).");
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
            return data;
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

    async function readTranscript() {
        const filePath = await join(storageDir, `${timelineInfo.timelineId}.json`);

        try {
            // Check if the file exists
            const fileExists = await exists(filePath, { baseDir: BaseDirectory.Document });

            if (!fileExists) {
                console.log("Transcript file does not exist for this timeline.");
                return;
            }

            // Read JSON file
            console.log("Reading json file...");
            const contents = await readTextFile(filePath, { baseDir: BaseDirectory.Document });
            let transcript = JSON.parse(contents);
            return transcript;
        } catch (error) {
            setError({
                title: "Error reading transcript",
                desc: "Failed to read the transcript file. Please try again."
            })
        }
    }

    async function populateSubtitles() {
        let transcript = await readTranscript();
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

    async function updateTranscript(speakers?: Speaker[], topSpeaker?: TopSpeaker, subtitles?: Subtitle[]) {
        if (!speakers && !subtitles) {
            return;
        }
        // read current file
        let transcript = await readTranscript();
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
        return await writeTextFile(filePath, JSON.stringify(transcript, null, 2), {
            baseDir: BaseDirectory.Document,
        });
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


    async function initialize() {
        await getTimelineInfo().then(async () => {
            await populateSubtitles();
        });
    }

    const hasInitialized = useRef(false);

    useEffect(() => {
        setTranscriptsFolder();

        // Prevents the effect from running again on subsequent renders
        if (!hasInitialized.current) {
            startTranscriptionServer();
            hasInitialized.current = true;
        }

        initializeStore();

        initialize();

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
                initialize,
                fetchTranscription,
                setSpeakers,
                updateSpeaker,
                getTimelineInfo,
                populateSubtitles,
                addSubtitles,
                exportSubtitles,
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