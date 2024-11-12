import { useEffect, createContext, useState, useContext } from 'react';
import { fetch } from '@tauri-apps/plugin-http';
import { BaseDirectory, readTextFile, exists, writeTextFile, mkdir } from '@tauri-apps/plugin-fs';
import { documentDir, join } from '@tauri-apps/api/path';
import { save } from '@tauri-apps/plugin-dialog';
import { Subtitle, Speaker, TopSpeaker } from "@/types/interfaces"
import { load } from '@tauri-apps/plugin-store';
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

    // edit page
    speakers: Speaker[];
    topSpeaker: TopSpeaker;
    setSpeakers: (newSpeakers: Speaker[]) => void;
    updateSpeaker: (index: number, label: string, color: string, style: string) => Promise<void>
    getTimelineInfo: () => void;
    getTracks: () => void;
    getTemplates: () => void;
    populateSubtitles: (timelineId: string) => Promise<void>;
    addSubtitles: (currentTemplate: string, currentTrack: string, filePath?: string) => Promise<void>;
    exportSubtitles: () => Promise<void>;
    initialize: () => void;
    jumpToTime: (start: number) => Promise<void>;
}

const resolveAPI = "http://localhost:5016/";
const transcribeAPI = "http://localhost:8000/transcribe/";
//const validateAPI = "http://localhost:8000/validate/";

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
    const [isLoading, setIsLoading] = useState(false);
    const [processingStep, setProcessingStep] = useState("");

    const [model, setModel] = useState("small");
    const [currentLanguage, setLanguage] = useState("english");
    const [currentTemplate, setTemplate] = useState("");
    const [currentTrack, setTrack] = useState("");
    const [translate, setTranslate] = useState(false);
    const [diarize, setDiarize] = useState(false);
    const [maxWords, setMaxWords] = useState(6);
    const [maxChars, setMaxChars] = useState(30);
    const transcriptsFolder = 'AutoSubs/Transcripts';

    async function getTranscriptStorageDir() {
        return await join(await documentDir(), transcriptsFolder)
    }

    async function getFullTranscriptPath() {
        let filePath = await join(await getTranscriptStorageDir(), `${timeline}.json`);
        return filePath;
    }

    async function initializeStore() {
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
    
        return {
            store,
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
    
    let store: any; // Add a type if possible
    
    // Initialize the store
    initializeStore().then((result) => {
        store = result.store;
    }).catch((error) => {
        console.error("Failed to initialize store:", error);
    });

    useEffect(() => {
        initializeStore().then((result) => {
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
                    if (line.includes('speechbrain.utils.quirks')) {
                        setProcessingStep("Diarizing speakers...")
                    }
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
                    output_dir: await getTranscriptStorageDir(),
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
            console.error('Error fetching timeline info:', error);
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

    async function readTranscript(timelineId: string) {
        if (timelineId == "") {
            timelineId = await getTimelineInfo();;
        }
        // Check if the file exists
        const filePath = await join(transcriptsFolder, `${timelineId}.json`);
        const fileExists = await exists(filePath, { baseDir: BaseDirectory.Document });

        if (!fileExists) {
            // check if directory exists
            let folderExists = await exists(transcriptsFolder, { baseDir: BaseDirectory.Document });
            if (!folderExists) {
                mkdir(transcriptsFolder, { baseDir: BaseDirectory.Document })
            }
            console.log("Transcript file does not exist for this timeline.");
            return;
        }

        // Read JSON file
        console.log("Reading json file...");
        const contents = await readTextFile(filePath, { baseDir: BaseDirectory.Document });
        let transcript = JSON.parse(contents);
        return transcript;
    }

    async function populateSubtitles(timelineId: string) {
        let transcript = await readTranscript(timelineId);
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
                outputDir: await join(await documentDir(), 'AutoSubs/')
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
        startTranscriptionServer();

        initialize();

        getCurrentWindow().once("tauri://close-requested", async () => {
            await saveState();
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