/**
 * 斗兽棋 3D - AI 搜索 Worker 入口
 *
 * 独立线程运行冠军级搜索，避免长思考阻塞 Three.js 渲染。
 */

import { installAiWorker, type WorkerGlobal } from './aiEngine';

installAiWorker(self as unknown as WorkerGlobal);
