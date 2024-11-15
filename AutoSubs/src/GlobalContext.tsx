import { useEffect, createContext, useState, useContext, useRef } from 'react';
import { fetch } from '@tauri-apps/plugin-http';
import { BaseDirectory, readTextFile, exists, writeTextFile } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { save } from '@tauri-apps/plugin-dialog';
import { Subtitle, Speaker, TopSpeaker } from "@/types/interfaces"
import { load, Store } from '@tauri-apps/plugin-store';
import { Child, Command } from '@tauri-apps/plugin-shell';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { exit } from '@tauri-apps/plugin-process';

let transcriptionProcess: Child | null = null;

interface GlobalContextProps {
    // home page
    timeline: string;
    trackList: Track[];
    templateList: Template[];
    currentTrack: string;
    currentTemplate: string;
    currentLanguage: string;
    model: string;
    translate: boolean;
    diarize: boolean;
    maxWords: number;
    maxChars: number;
    processingStep: string;
    isLoading: boolean;
    error: string;
    setError: (errorMsg: string) => void
    setIsLoading: (newIsLoading: boolean) => void;
    setTemplate: (newTemplate: string) => void;
    setLanguage: (newLanguage: string) => void;
    setTrack: (newTrack: string) => void;
    setModel: (newModel: string) => void;
    setTranslate: (newTranslate: boolean) => void;
    setDiarize: (newDiarize: boolean) => void;
    setMaxWords: (newMaxWords: number) => void;
    setMaxChars: (newMaxChars: number) => void;
    fetchTranscription: () => Promise<void>;
    subtitles: Subtitle[];

    // edit page
    speakers: Speaker[];
    topSpeaker: TopSpeaker;
    setSpeakers: (newSpeakers: Speaker[]) => void;
    updateSpeaker: (index: number, label: string, color: string, style: string) => Promise<void>
    getTimelineInfo: () => Promise<void>;
    getTracks: () => Promise<void>;
    getTemplates: () => Promise<void>;
    populateSubtitles: (timelineId: string) => Promise<void>;
    addSubtitles: (currentTemplate: string, currentTrack: string, filePath?: string) => Promise<void>;
    exportSubtitles: () => Promise<void>;
    initialize: () => void;
    jumpToTime: (start: number) => Promise<void>;
}

const resolveAPI = "http://localhost:55010/";
const transcribeAPI = "http://localhost:55000/transcribe/";
//const validateAPI = "http://localhost:55000/validate/";
const transcriptsFolder = '/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Utility/';
let store: Store | null = null;

interface Template {
    value: string;
    label: string;
}
interface Track {
    value: string;
    label: string;
}

const GlobalContext = createContext<GlobalContextProps | undefined>(undefined);

export function GlobalProvider({ children }: React.PropsWithChildren<{}>) {
    const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
    const [speakers, setSpeakers] = useState<Speaker[]>([]);
    const [templateList, setTemplateList] = useState<Template[]>([]);
    const [trackList, setTrackList] = useState<Track[]>([]);
    const [timeline, setTimeline] = useState<string>("");
    const [topSpeaker, setTopSpeaker] = useState<TopSpeaker>({ label: "", id: "", percentage: 0 });
    const [isLoading, setIsLoading] = useState(true);
    const [processingStep, setProcessingStep] = useState("Starting Transcription Server...");
    const [error, setError] = useState("");
    const serverLoading = useRef(true);

    const [model, setModel] = useState("small");
    const [currentLanguage, setLanguage] = useState("english");
    const [currentTemplate, setTemplate] = useState("");
    const [currentTrack, setTrack] = useState("");
    const [translate, setTranslate] = useState(false);
    const [diarize, setDiarize] = useState(false);
    const [maxWords, setMaxWords] = useState(6);
    const [maxChars, setMaxChars] = useState(30);

    async function getFullTranscriptPath() {
        let filePath = await join(transcriptsFolder, `${timeline}.json`);
        return filePath;
    }

    async function initializeStore() {
        if (!store) {
            store = await load(await join(transcriptsFolder, 'autosubs-store.json'), { autoSave: false });
        }

        const [
            storedModel,
            storedCurrentLanguage,
            storedCurrentTemplate,
            storedCurrentTrack,
            storedTranslate,
            storedDiarize,
            storedMaxWords,
            storedMaxChars
        ] = await Promise.all([
            store.get<string>('model'),
            store.get<string>('currentLanguage'),
            store.get<string>('currentTemplate'),
            store.get<string>('currentTrack'),
            store.get<boolean>('translate'),
            store.get<boolean>('diarize'),
            store.get<number>('maxWords'),
            store.get<number>('maxChars'),
        ]);

        return {
            storedModel,
            storedCurrentLanguage,
            storedCurrentTemplate,
            storedCurrentTrack,
            storedTranslate,
            storedDiarize,
            storedMaxWords,
            storedMaxChars,
        };
    }

    useEffect(() => {
        initializeStore().then((result) => {
            console.log('Stored model:', result.storedModel);
            setModel(result.storedModel || "small");
            setLanguage(result.storedCurrentLanguage || "english");
            setTemplate(result.storedCurrentTemplate || "");
            setTrack(result.storedCurrentTrack || "");
            setTranslate(result.storedTranslate || false);
            setDiarize(result.storedDiarize || false);
            setMaxWords(result.storedMaxWords || 6);
            setMaxChars(result.storedMaxChars || 30);
        }).catch((error) => {
            console.error("Error initializing state:", error);
        });
    }, []);

    async function startTranscriptionServer() {
        try {
            // Create the command without using 'open' or shell-specific arguments
            const command = Command.create('transcription-server')

            // Set up event listeners for logging
            command.on('close', (data) => {
                console.log(`Transcription server exited with code ${data.code} and signal ${data.signal}`);
            });

            command.on('error', (error) => {
                console.error(`Transcription server encountered an error: "${error}"`);
            });

            command.stdout.on('data', (line) => {
                const regex = /\[\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}\.\d{3}\]\s+(.*)/;
                const match = line.match(regex);
                if (match && match[1]) {
                    let subtitle = { text: match[1], start: "", end: "", speaker: "" };
                    setSubtitles(prevSubtitles => [...prevSubtitles, subtitle]);
                }

                /*
                if (line.includes('segmentation')) {
                    const match = line.match(/(\w+)\s+.*?(\d+)%/);
                    const percentage = Number(match) / 100 * 25
                    setProcessingStep(`Diarizing speakers... (${Math.round(percentage)}%)`)
                } else if (line.includes('speaker_counting')) {
                    const match = line.match(/(\w+)\s+.*?(\d+)%/);
                    const percentage = 25 + (Number(match) / 100 * 25)
                    setProcessingStep(`Diarizing speakers... (${Math.round(percentage)}%)`)
                } else if (line.includes('embeddings')) {
                    const match = line.match(/(\w+)\s+.*?(\d+)%/);
                    const percentage = 50 + (Number(match) / 100 * 25)
                    setProcessingStep(`Diarizing speakers... (${Math.round(percentage)}%)`)
                } else if (line.includes('discrete_diarization')) {
                    const match = line.match(/(\w+)\s+.*?(\d+)%/);
                    const percentage = 75 + (Number(match) / 100 * 25)
                    setProcessingStep(`Diarizing speakers... (${Math.round(percentage)}%)`)
                }
                console.log(`Transcription Server STDOUT: "${line}"`);
                */
            });

            command.stderr.on('data', (line) => {
                // Check if the message is an informational message
                if (line == "" || line.length < 1) {
                    return;
                }
                if ((line.includes('address already in use') || line.includes('Uvicorn running')) && serverLoading.current) {
                    setProcessingStep("");
                    setIsLoading(false);
                    serverLoading.current = false;
                }

                if (line.includes('INFO:') || line.includes('VAD') || line.includes('Adjustment')) {
                    if (line.includes('speechbrain')) {
                        setProcessingStep("Diarizing speakers...");
                        setIsLoading(true);
                    }
                    else {
                        console.log(`Transcription Server INFO: "${line}"`);
                    }
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

    async function fetchTranscription() {
        setIsLoading(true);
        setSubtitles([]);
        setProcessingStep("Exporting Audio...")
        try {
            // Export audio and set timeline
            let audioInfo = await exportAudio();
            setTimeline(audioInfo.timeline);
            console.log("Fetching transcription...");
            setProcessingStep("Transcribing Audio...");

            // Make the POST request to the transcription API
            const response = await fetch(transcribeAPI, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    file_path: audioInfo.path,
                    output_dir: transcriptsFolder,
                    timeline: audioInfo.timeline,
                    model: model,
                    language: currentLanguage,
                    task: translate ? "translate" : "transcribe",
                    diarize: diarize,
                    max_words: maxWords,
                    max_chars: maxChars,
                }),
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
                setError(errorMessage);
                // Throw an error to be caught in the catch block
                throw new Error(errorMessage);
            }

            // If the response is successful, parse the JSON data
            const data = await response.json();
            const filePath = data.result_file;

            // Proceed with processing the transcription result
            setProcessingStep("Populating timeline...");
            setSubtitles([]);
            await populateSubtitles(audioInfo.timeline);
            await addSubtitles(currentTemplate, currentTrack, filePath);

        } catch (error: unknown) { // Explicitly type 'error' as 'unknown'
            // Handle any errors that occurred during the fetch or processing
            console.error("Error fetching transcription:", error);

            // Initialize a default error message
            let errorMessage = "An unexpected error occurred.";

            // Type guard: Check if 'error' is an instance of Error
            if (error instanceof Error) {
                errorMessage = error.message;
            } else if (typeof error === 'string') {
                // If error is a string, use it directly
                errorMessage = error;
            }

            // Update the error state with the appropriate message
            setError(errorMessage);

        } finally {
            // Ensure that the loading state is reset regardless of success or failure
            console.log("Finished transcribing.");
            setIsLoading(false);
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
            let timelineId = data.timelineId;
            setTimeline(data.timelineId);
            return timelineId;
        } catch (error) {
            console.error('Error fetching timeline info (failed to connect to AutoSubs Link in Resolve):', error);
        }
    }

    async function jumpToTime(start: number) {
        try {
            const response = await fetch(resolveAPI, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ func: "JumpToTime", start }),
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const data = await response.json();
            console.log(data);
        } catch (error) {
            console.error('Error jumping to time:', error);
        }
    }

    async function getTracks() {
        try {
            const response = await fetch(resolveAPI, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ func: "GetTracks" }),
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const data = await response.json();
            setTrackList(data);
            console.log(data);
        } catch (error) {
            console.error('Error fetching tracks:', error);
            setError('Error fetching tracks (failed to connect to AutoSubs Link in Resolve): ' + error)
        }
    }

    async function getTemplates() {
        try {
            const response = await fetch(resolveAPI, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ func: "GetTemplates" }),
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const data = await response.json();
            setTemplateList(data);
            console.log(data);
        } catch (error) {
            console.error('Error fetching templates:', error);
            setError('Error getting templates (failed to connect to AutoSubs Link in Resolve): ' + error)
        }
    }

    async function readTranscript(timelineId: string) {
        if (timelineId == "") {
            timelineId = await getTimelineInfo();
            if (timelineId == "" || timelineId == undefined) return
        }

        const filePath = await join(transcriptsFolder, `${timelineId}.json`);

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
            setError(String(error))
        }
    }

    async function populateSubtitles(timelineId: string) {
        let transcript = await readTranscript(timelineId);
        if (transcript) {
            setSubtitles(transcript.segments);
            setSpeakers(transcript.speakers);
            setTopSpeaker(transcript.top_speaker);
        }
    }

    async function exportAudio() {
        // send request to Lua server (Resolve)
        const response = await fetch(resolveAPI, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                func: "ExportAudio",
                outputDir: transcriptsFolder
            }),
        });

        const data = await response.json();
        setTimeline(data.timelineId);
        return data;
    };

    async function addSubtitles(currentTemplate: string, currentTrack: string, filePath?: string) {
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
                    trackIndex: currentTrack,
                }),
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const data = await response.json();
            console.log(data);
        } catch (error) {
            console.error('Error adding subtitles:', error);
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
        let transcript = await readTranscript(timeline);
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
        const filePath = await join(transcriptsFolder, `${timeline}.json`);
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
        await populateSubtitles("");
        await getTracks();
        await getTemplates();
    }

    async function saveState() {
        if (!store) {
            console.error('Store is not initialized.');
            return;
        }
    
        try {
            await store.set('model', model);
            await store.set('currentLanguage', currentLanguage);
            await store.set('currentTemplate', currentTemplate);
            await store.set('currentTrack', currentTrack);
            await store.set('translate', translate);
            await store.set('diarize', diarize);
            await store.set('maxWords', maxWords);
            await store.set('maxChars', maxChars);
            await store.save(); // Persist changes
        } catch (error) {
            console.error('Error saving state:', error);
        }
    }

    useEffect(() => {
        saveState();
    }, [model, currentLanguage, currentTemplate, currentTrack, translate, diarize, maxWords, maxChars])

    const hasInitialized = useRef(false);

    useEffect(() => {
        if (hasInitialized.current) return; // Prevents the effect from running again
        hasInitialized.current = true;

        startTranscriptionServer();
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
                timeline,
                trackList,
                templateList,
                subtitles,
                speakers,
                topSpeaker,
                currentTrack,
                currentTemplate,
                currentLanguage,
                model,
                translate,
                diarize,
                maxWords,
                maxChars,
                processingStep,
                isLoading,
                error,
                setError,
                setIsLoading,
                setModel,
                setTranslate,
                setDiarize,
                setMaxWords,
                setMaxChars,
                setTemplate,
                setLanguage,
                setTrack,
                initialize,
                fetchTranscription,
                setSpeakers,
                updateSpeaker,
                getTimelineInfo,
                getTracks,
                getTemplates,
                populateSubtitles,
                addSubtitles,
                exportSubtitles,
                jumpToTime
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