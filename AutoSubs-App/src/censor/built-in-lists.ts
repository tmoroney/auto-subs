import { CensorWordList } from '@/types';

export const BUILT_IN_CENSOR_LISTS: CensorWordList[] = [
    {
        id: "builtin:en-profanity",
        name: "English Profanity",
        description: "Common English swear words and profanity",
        builtIn: true,
        words: [
            "ass", "asses", "asshole", "assholes",
            "bastard", "bastards",
            "bitch", "bitches",
            "bullshit",
            "crap",
            "damn", "damned",
            "dammit",
            "dick", "dicks",
            "fuck", "fucks", "fucking", "fucked", "fucker", "fuckers",
            "goddamn", "goddamnit",
            "hell",
            "motherfucker", "motherfuckers",
            "piss", "pissed",
            "shit", "shits", "shitting",
            "slut", "sluts",
            "whore", "whores",
        ],
    },
];

export function isBuiltInCensorListId(id: string): boolean {
    return id.startsWith("builtin:");
}
