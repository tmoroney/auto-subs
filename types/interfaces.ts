export interface DownloadOption {
    name: string
    version: string
    size: string
    os: 'Windows' | 'macOS' | 'Linux'
    downloadUrl: string
    isRecommended?: boolean
}