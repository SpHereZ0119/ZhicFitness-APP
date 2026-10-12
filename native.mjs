import { Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';
import { createNativeAdapter } from './native-adapter.mjs';

export const native = createNativeAdapter({ Filesystem, Share, Browser, App });
