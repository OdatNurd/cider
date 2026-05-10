import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ElectronService } from '../electron/electron.service';
import { PersistentPath } from '../types/persistent-path.type';

export interface ExportConfiguration {
  exportType?: string;
  paperType?: string;
  paperConfig?: {
    width: number;
    height: number;
    width_custom: number;
    height_custom: number;
    orientation: 'landscape' | 'portrait';
    mirrorBacksX: boolean;
    mirrorBacksY: boolean;
    cardsPerPage: number;
    cardGap: number;
    paperMarginX: number;
    paperMarginY: number;
    paperDpi: number;
  },
  lowInk?: boolean;
  excludeCardBacks?: boolean;
  showCutMarks?: boolean;
  cutBleed?: number;
  cutMarkLength?: number;
  individualExportPixelRatio?: number;
  individualExportUseCardName?: boolean;
  scale?: number;
  maxTtsPixels?: number;
  softProofMode?: string;
  softProofIntent?: number;
  softProofEnabled?: boolean;
  simulateUnsharpMask?: boolean;
}

export interface PreviewSettings {
  tiltEnabled: boolean;
  trimLinesEnabled: boolean;
  trimOffset: number;
  trimUnit: 'in' | 'px' | 'mm';
  safeLinesEnabled: boolean;
  safeOffset: number;
  safeUnit: 'in' | 'px' | 'mm';
}

/**
 * Local storage is used for storing user preferences
 */
@Injectable({
  providedIn: 'root'
})
export class LocalStorageService {
  static readonly RECENT_PROJECT_URLS = "recent-project-urls";
  static readonly MAX_RECENT_PROJECT_URLS = 5;
  static readonly DARK_MODE = "dark-mode";
  static readonly RENDERER_TYPE = "renderer-type";
  static readonly EXPORT_CONFIG = "export-config";
  static readonly PREVIEW_SETTINGS = "preview-settings";
  static readonly TREE_STATE_PREFIX = "sidebar-tree-state-";
  static readonly AUTO_LOAD_PROJECT = "auto-load-project";
  static readonly LAST_LOADED_PROJECT = "last-loaded-project";

  public recentProjectUrls: BehaviorSubject<PersistentPath[]>;
  public initialCleanupDone: Promise<void>;

  constructor(
    private electronService: ElectronService) {
    this.recentProjectUrls = new BehaviorSubject<PersistentPath[]>(
      this.getRecentProjectUrlsFromLocalStorage());

    // clean up the recent project urls -- remove any that are empty or don't exist
    this.initialCleanupDone = this.cleanRecentProjectUrls().then(urls => {
      localStorage.setItem(LocalStorageService.RECENT_PROJECT_URLS, JSON.stringify(urls));
      this.recentProjectUrls.next(urls);
    });
    
    // Clean up orphaned tree states
    this.cleanOrphanedStates();
  }

  public addRecentProjectUrl(persistentUrl: PersistentPath) {
    let urls = this.getRecentProjectUrlsFromLocalStorage();
    urls = urls.filter(item => item.path !== persistentUrl.path);
    if (urls.length >= LocalStorageService.MAX_RECENT_PROJECT_URLS) {
      urls.pop();
    }
    urls.unshift(persistentUrl);
    localStorage.setItem(LocalStorageService.RECENT_PROJECT_URLS, JSON.stringify(urls));
    this.recentProjectUrls.next(urls);
  }

  public removeRecentProjectUrl(path: string) {
    let urls = this.getRecentProjectUrlsFromLocalStorage();
    urls = urls.filter(item => item.path !== path);
    localStorage.setItem(LocalStorageService.RECENT_PROJECT_URLS, JSON.stringify(urls));
    this.recentProjectUrls.next(urls);
  }

  private getRecentProjectUrlsFromLocalStorage(): PersistentPath[] {
    const urlsString: string | null = localStorage.getItem(LocalStorageService.RECENT_PROJECT_URLS);
    if (urlsString === null) {
      return [];
    }
    const urls = JSON.parse(urlsString);
    // if urls is an array of strings, convert it to an array of PersistentUrl objects
    if (urls.length > 0 && typeof urls[0] === 'string') {
      return urls.map((url: any) => ({ url, bookmark: '' }));
    }
    // if urls is already an array of PersistentUrl objects, return it as is
    return urls;
  }

  public getLanguage(): string | null {
    return localStorage.getItem('language');
  }

  public setLanguage(lang: string) {
    localStorage.setItem('language', lang);
  }

  /**
   * Filter out any directories that are empty or don't exist from the recent project urls
   * 
   * @returns 
   */
  public async cleanRecentProjectUrls(): Promise<PersistentPath[]> {
    const urls = this.getRecentProjectUrlsFromLocalStorage();
    const promises = urls.map(url => this.electronService.listDirectory(url)
      .then(files => files.length > 0 ? url : undefined).catch(() => undefined));
    
    const resolvedUrls = await Promise.all(promises);
    const validUrls = resolvedUrls.filter(url => url !== undefined) as PersistentPath[];

    const lastLoaded = this.getLastLoadedProject();
    if (lastLoaded && !validUrls.find(u => u.path === lastLoaded.path)) {
      this.clearLastLoadedProject();
    }

    return validUrls;
  }

  public getRecentProjectUrls() {
    return this.recentProjectUrls.asObservable();
  }

  public getDarkMode(): boolean {
    const darkMode = localStorage.getItem(LocalStorageService.DARK_MODE);
    return darkMode === 'true' || darkMode === null; // Default to true if not set
  }

  public setDarkMode(darkMode: boolean) {
    localStorage.setItem(LocalStorageService.DARK_MODE, darkMode.toString());
  }

  public getRenderer(): string {
    return localStorage.getItem(LocalStorageService.RENDERER_TYPE) || 'html-to-image';
  }

  public setRenderer(renderer: string) {
    localStorage.setItem(LocalStorageService.RENDERER_TYPE, renderer);
  }

  public getExportConfig(): ExportConfiguration | null {
    const config = localStorage.getItem(LocalStorageService.EXPORT_CONFIG);
    return config ? JSON.parse(config) : null;
  }

  public setExportConfig(config: ExportConfiguration) {
    localStorage.setItem(LocalStorageService.EXPORT_CONFIG, JSON.stringify(config));
  }

  public getPreviewSettings(): PreviewSettings | null {
    const settings = localStorage.getItem(LocalStorageService.PREVIEW_SETTINGS);
    return settings ? JSON.parse(settings) : null;
  }

  public setPreviewSettings(settings: PreviewSettings) {
    localStorage.setItem(LocalStorageService.PREVIEW_SETTINGS, JSON.stringify(settings));
  }

  public getTreeState(projectPath: string): string[] | null {
    const stateStr = localStorage.getItem(`${LocalStorageService.TREE_STATE_PREFIX}${projectPath}`);
    if (!stateStr) return null;
    try {
      return JSON.parse(stateStr);
    } catch (e) {
      return null;
    }
  }

  public setTreeState(projectPath: string, state: string[]) {
    localStorage.setItem(`${LocalStorageService.TREE_STATE_PREFIX}${projectPath}`, JSON.stringify(state));
  }

  public getAutoLoadLastProject(): boolean {
    return localStorage.getItem(LocalStorageService.AUTO_LOAD_PROJECT) === 'true';
  }

  public setAutoLoadLastProject(autoLoad: boolean) {
    localStorage.setItem(LocalStorageService.AUTO_LOAD_PROJECT, autoLoad.toString());
  }

  public getLastLoadedProject(): PersistentPath | null {
    const val = localStorage.getItem(LocalStorageService.LAST_LOADED_PROJECT);
    return val ? JSON.parse(val) : null;
  }

  public setLastLoadedProject(path: PersistentPath) {
    localStorage.setItem(LocalStorageService.LAST_LOADED_PROJECT, JSON.stringify(path));
  }

  public clearLastLoadedProject() {
    localStorage.removeItem(LocalStorageService.LAST_LOADED_PROJECT);
  }

  public async cleanOrphanedStates() {
    const prefix = LocalStorageService.TREE_STATE_PREFIX;
    const keysToCheck: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        keysToCheck.push(key);
      }
    }

    for (const key of keysToCheck) {
      const projectPath = key.substring(prefix.length);
      try {
        const files = await this.electronService.listDirectory({ path: projectPath } as PersistentPath);
        if (!files || files.length === 0) {
          localStorage.removeItem(key);
        }
      } catch (e) {
        // If error reading directory, assume it's gone
        localStorage.removeItem(key);
      }
    }
  }
}
