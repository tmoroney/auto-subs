import React, { createContext, useState, useContext, useEffect } from 'react';
import { fetch } from '@tauri-apps/plugin-http';
import { BaseDirectory, readTextFile, exists, writeTextFile } from '@tauri-apps/plugin-fs';
import { save } from '@tauri-apps/plugin-dialog';
import { Subtitle, AudioInfo, Speaker } from "@/types/interfaces"

interface GlobalContextProps {
    timeline: string;
    trackList: Track[];
    templateList: Template[];
    subtitles: Subtitle[];
    speakers: Speaker[];
    topSpeaker: string;
    setSpeakers: (newSpeakers: Speaker[]) => void;
    getTimelineInfo: () => void;
    getTracks: () => void;
    getTemplates: () => void;
    populateSubtitles: () => Promise<void>;
    exportAudio: () => Promise<AudioInfo>;
    addSubtitles: (filePath: string, currentTemplate: string, currentTrack: string) => Promise<void>;
    exportSubtitles: (jsonData: object) => void;
    initialize: () => void;
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

export function GlobalProvider({ children }: React.PropsWithChildren<{}>) {
    const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
    const [speakers, setSpeakers] = useState<Speaker[]>([]);
    const [templateList, setTemplateList] = useState<Template[]>([]);
    const [trackList, setTrackList] = useState<Track[]>([]);
    const [timeline, setTimeline] = useState<string>("");
    const [topSpeaker, setTopSpeaker] = useState("Speaker 1");

    async function getTimelineInfo() {
        try {
            const response = await fetch(resolveAPI, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ func: "GetTimelineInfo" }),
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const data = await response.json();
            setTimeline(data.timelineId);
        } catch (error) {
            console.error('Error fetching timeline info:', error);
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

    async function populateSubtitles() {
        // Check if the file exists
        const transcriptPath = `AutoSubs/Transcripts/${timeline}.json`;
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
        setSubtitles(transcript.segments);
        setSpeakers(transcript.speakers);
        setTopSpeaker(transcript.top_speaker.label);
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

    async function addSubtitles(filePath: string, currentTemplate: string, currentTrack: string) {
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

    async function initialize() {
        await getTimelineInfo();
        await getTracks();
        await getTemplates();
        await populateSubtitles();
    }

    return (
        <GlobalContext.Provider value={{ timeline, trackList, templateList, subtitles, speakers, topSpeaker, initialize, setSpeakers, getTimelineInfo, getTracks, getTemplates, populateSubtitles, exportAudio, addSubtitles, exportSubtitles }}>
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