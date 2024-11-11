import { useEffect, createContext, useState, useContext, useRef } from 'react';
import { fetch } from '@tauri-apps/plugin-http';
import { BaseDirectory, readTextFile, exists, writeTextFile } from '@tauri-apps/plugin-fs';
import { documentDir, join } from '@tauri-apps/api/path';
import { save } from '@tauri-apps/plugin-dialog';
import { Subtitle, AudioInfo, Speaker, TopSpeaker } from "@/types/interfaces"
import { load } from '@tauri-apps/plugin-store';
import { Child, Command } from '@tauri-apps/plugin-shell';
import { getCurrentWindow } from '@tauri-apps/api/window';

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
    setIsLoading: (newIsLoading: boolean) => void;
    setTemplate: (newTemplate: string) => void;
    setLanguage: (newLanguage: string) => void;
    setTrack: (newTrack: string) => void;
    setModel: (newModel: string) => void;
    setTranslate: (newTranslate: boolean) => void;
    setDiarize: (newDiarize: boolean) => void;
    setMaxWords: (newMaxWords: number) => void;
    setMaxChars: (newMaxChars: number) => void;
    fetchTranscription: () => void;
    subtitles: Subtitle[];
    tempSubtitles: Subtitle[];

    // edit page
    speakers: Speaker[];
    topSpeaker: TopSpeaker;
    setSpeakers: (newSpeakers: Speaker[]) => void;
    updateSubtitlesFile: (speakers?: Speaker[], subtitles?: Subtitle[]) => Promise<void>;
    getTimelineInfo: () => void;
    getTracks: () => void;
    getTemplates: () => void;
    populateSubtitles: (timelineId?: string) => Promise<void>;
    addSubtitles: (currentTemplate: string, currentTrack: string, filePath?: string) => Promise<void>;
    exportSubtitles: (jsonData: object) => Promise<void>;
    initialize: () => void;
    jumpToTime: (start: number) => Promise<void>;
}

const resolveAPI = "http://localhost:5016/";
const transcribeAPI = "http://localhost:8000/transcribe/";
const validateAPI = "http://localhost:8000/validate/";

interface Template {
    value: string;
    label: string;
}
interface Track {
    value: string;
    label: string;
}

const GlobalContext = createContext<GlobalContextProps | undefined>(undefined);
const store = await load('store.json', { autoSave: false });
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

export function GlobalProvider({ children }: React.PropsWithChildren<{}>) {
    const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
    const [speakers, setSpeakers] = useState<Speaker[]>([]);
    const [templateList, setTemplateList] = useState<Template[]>([]);
    const [trackList, setTrackList] = useState<Track[]>([]);
    const [timeline, setTimeline] = useState<string>("");
    const [topSpeaker, setTopSpeaker] = useState<TopSpeaker>({ label: "", percentage: 0 });
    const [isLoading, setIsLoading] = useState(false);
    const [processingStep, setProcessingStep] = useState("");

    const [model, setModel] = useState(storedModel || "small");
    const [currentLanguage, setLanguage] = useState(storedCurrentLanguage || "english");
    const [currentTemplate, setTemplate] = useState(storedCurrentTemplate || "");
    const [currentTrack, setTrack] = useState(storedCurrentTrack || "");
    const [translate, setTranslate] = useState(storedTranslate || false);
    const [diarize, setDiarize] = useState(storedDiarize || false);
    const [maxWords, setMaxWords] = useState(storedMaxWords || 6);
    const [maxChars, setMaxChars] = useState(storedMaxChars || 30);
    const [tempSubtitles, setTempSubtitles] = useState<Subtitle[]>([]);

    const parseSubtitle = (stdout: string) => {
        const regex = /\[\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}\.\d{3}\]\s+(.*)/;
        const match = stdout.match(regex);
        if (match && match[1]) {
            //const subtitle: Subtitle = { text: match[1].trim(), start: "", end: "", speaker: "" };
            setProcessingStep(match[1].trim());
        }
    };

    async function startTranscriptionServer() {
        try {
            // Create the command without using 'open' or shell-specific arguments
            const command = Command.create('transcription-server');

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
                //console.log(`Transcription Server STDOUT: "${line}"`);
            });

            command.stderr.on('data', (line) => {
                // Check if the message is an informational message
                if (line == "" || line.length < 1) {
                    return;
                }
                if (line.includes('INFO:') || line.includes('VAD') || line.includes('Adjustment')) {
                    console.log(`Transcription Server INFO: "${line}"`);
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
            let audioInfo = await exportAudio();
            //setTimeline(audioInfo.timeline);
            console.log("Fetching transcription...");
            setProcessingStep("Transcribing Audio...")

            const response = await fetch(transcribeAPI, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    file_path: audioInfo.path,
                    timeline: audioInfo.timeline,
                    model: model,
                    language: currentLanguage,
                    task: translate ? "translate" : "transcribe",
                    diarize: diarize,
                    max_words: maxWords,
                    max_chars: maxChars,
                }),
            });

            if (response.status !== 200) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json()
            const filePath = data.result_file;

            setProcessingStep("Populating timeline...")
            setSubtitles([]);
            await populateSubtitles(audioInfo.timeline);
            await addSubtitles(currentTemplate, currentTrack, filePath);
        } catch (error) {
            console.error("Error fetching transcription:", error);
        } finally {
            setIsLoading(false);
        }
    }

    async function getTranscriptPath() {
        let filePath = await join(await documentDir(), `AutoSubs/Transcripts/${timeline}.json`);
        return filePath;
    }

    async function getTimelineInfo() {
        let timelineId = "";
        try {
            const response = await fetch(resolveAPI, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ func: "GetTimelineInfo" }),
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const data = await response.json();
            timelineId = data.timelineId;
            setTimeline(data.timelineId);
        } catch (error) {
            console.error('Error fetching timeline info:', error);
        }
        return timelineId;
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
        }
    }

    async function readSubtitlesFile(timelineId?: string) {
        if (!timelineId) {
            timelineId = await getTimelineInfo();;
        }
        // Check if the file exists
        const transcriptPath = `AutoSubs/Transcripts/${timelineId}.json`;
        const fileExists = await exists(transcriptPath, {
            baseDir: BaseDirectory.Document,
        });

        if (!fileExists) {
            console.log("Transcript file does not exist for this timeline.");
            return;
        }

        // Read JSON file
        console.log("Reading json file...");
        const contents = await readTextFile(transcriptPath, {
            baseDir: BaseDirectory.Document,
        });
        let transcript = JSON.parse(contents);
        return transcript;
    }

    async function populateSubtitles(timelineId?: string) {
        let transcript = await readSubtitlesFile(timelineId);
        setSubtitles(transcript.segments);
        setSpeakers(transcript.speakers);
        setTopSpeaker(transcript.top_speaker);
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
            }),
        });

        const data = await response.json();
        setTimeline(data.timelineId);
        return data;
    };

    async function addSubtitles(currentTemplate: string, currentTrack: string, filePath?: string) {
        if (!filePath) {
            await updateSubtitlesFile(speakers);
            filePath = await getTranscriptPath();
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

    async function exportSubtitles(jsonData: object) {
        try {
            const filePath = await save({
                defaultPath: 'subtitles.json',
                filters: [{ name: 'JSON Files', extensions: ['json'] }],
            });

            if (!filePath) {
                console.log('Save was canceled');
                return;
            }

            await writeTextFile(filePath, JSON.stringify(jsonData, null, 2));
            console.log('File saved to', filePath);
        } catch (error) {
            console.error('Failed to save file', error);
        }
    }

    async function updateSubtitlesFile(speakers?: Speaker[], subtitles?: Subtitle[]) {
        if (!speakers && !subtitles) {
            return;
        }
        // read current file
        let transcript = await readSubtitlesFile(timeline);
        if (speakers) {
            transcript.speakers = speakers;
        }
        if (subtitles) {
            transcript.segments = subtitles;
        }

        // write to file
        const transcriptPath = `AutoSubs/Transcripts/${timeline}.json`;
        return writeTextFile(transcriptPath, JSON.stringify(transcript, null, 2), {
            baseDir: BaseDirectory.Document,
        });
    }


    async function initialize() {
        let timelineId = await getTimelineInfo();
        await populateSubtitles(timelineId);
        await getTracks();
        await getTemplates();
    }

    async function saveState() {
        await store.set('model', model);
        await store.set('currentLanguage', currentLanguage);
        await store.set('currentTemplate', currentTemplate);
        await store.set('currentTrack', currentTrack);
        await store.set('translate', translate);
        await store.set('diarize', diarize);
        await store.set('maxWords', maxWords);
        await store.set('maxChars', maxChars);
        await store.save();
    };

    useEffect(() => {
        saveState();

    }, [model, currentLanguage, currentTemplate, currentTrack, translate, diarize, maxWords, maxChars]);

    let isServerStarted = useRef(false);
    useEffect(() => {
        if (!isServerStarted.current) {
            startTranscriptionServer();
            isServerStarted.current = true;
        }
        initialize();

        getCurrentWindow().once("tauri://close-requested", async function () {
            await stopTranscriptionServer();
        });
    }, []);

    return (
        <GlobalContext.Provider
            value={{
                timeline,
                trackList,
                templateList,
                subtitles,
                tempSubtitles,
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
                updateSubtitlesFile,
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