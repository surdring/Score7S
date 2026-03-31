// pages/score/score.ts - 评分页面
import {
  SCORING_ITEMS,
  SCORING_MAX_SCORES,
  SCORING_LOW_THRESHOLDS,
  QUICK_TAGS,
  SCORING_STANDARDS,
  ScoringItem,
} from '../../config/scoring';
import { debounce } from '../../utils/util';

const app = getApp();

interface Department {
  _id: string;
  name: string;
  rooms: string[];
}

interface ScoreItem {
  score: number | null;
  images: string[];
  remark: string;
}

type ScoreMap = Record<ScoringItem, ScoreItem>;

interface OfficeKey {
  dept: string;
  room: string;
}

interface NextOfficeSelection {
  deptIndex: number;
  roomIndex: number;
}

interface SubmittedInspectionData {
  _id: string;
  date: string;
  checkerId: string;
  checkerName: string;
  department: string;
  room: string;
  totalScore: number;
  details: Array<{ item: string; score: number; images: string[]; remark: string }>;
  scoredCount?: number;
  totalOffices?: number;
}

interface RoomRecord {
  _id: string;
  departmentId: string;
  name: string;
}

type ScorePageThis = {
  data: {
    scores: ScoreMap;
  };
  setData: (data: Record<string, unknown>) => void;
  debouncedUpdateRemark?: (item: ScoringItem, remark: string) => void;
};

Page({
  data: {
    loading: true,
    submitting: false,
    // 表单数据
    date: '',
    scoredOfficeKeys: [] as string[],
    departments: [] as Department[],
    selectedDept: '',
    selectedRoom: '',
    deptIndex: 0,
    roomIndex: 0,
    // 评分数据
    scores: {} as ScoreMap,
    scoringItems: SCORING_ITEMS,
    scoringStandards: SCORING_STANDARDS,
    scoringMaxScores: SCORING_MAX_SCORES,
    scoringLowThresholds: SCORING_LOW_THRESHOLDS,
    quickTags: QUICK_TAGS,
    totalScore: 0,
    scoredCount: 0,
    // 提交成功
    submitted: false,
    submittedData: null as SubmittedInspectionData | null,
  },

  onLoad() {
    this.initForm();
    
    // 创建防抖版本的备注更新方法（减少高频输入时的 setData 调用）
    const that = this as unknown as ScorePageThis;
    that.debouncedUpdateRemark = debounce<ScorePageThis, [ScoringItem, string]>(function (item, remark) {
      const scores = { ...this.data.scores };
      scores[item] = { ...scores[item], remark };
      this.setData({ scores });
    }, 200);
  },

  makeScoredOfficeKey(dept: string, room: string): string {
    return `${dept}|${room}`;
  },

  hasOfficeScored(dept: string, room: string): boolean {
    const key = this.makeScoredOfficeKey(dept, room);
    return this.data.scoredOfficeKeys.includes(key);
  },

  isOfficeScored(date: string, dept: string, room: string): boolean {
    return this.hasOfficeScored(dept, room);
  },

  getNextRoomInDept(deptIndex: number, currentRoomIndex: number): OfficeKey | null {
    const dept = this.data.departments[deptIndex];
    if (!dept || !dept.rooms || dept.rooms.length === 0) return null;

    const rooms = dept.rooms;
    const date = this.data.date;

    const start = (currentRoomIndex + 1) % rooms.length;
    for (let i = 0; i < rooms.length; i++) {
      const idx = (start + i) % rooms.length;
      const room = rooms[idx];
      if (!this.isOfficeScored(date, dept.name, room)) {
        return { dept: dept.name, room };
      }
    }

    return null;
  },

  getNextUnscoredDept(deptIndex: number): NextOfficeSelection | null {
    const departments = this.data.departments;
    if (!departments || departments.length === 0) return null;

    const date = this.data.date;
    const start = (deptIndex + 1) % departments.length;

    for (let i = 0; i < departments.length; i++) {
      const idx = (start + i) % departments.length;
      const dept = departments[idx];
      if (!dept?.rooms || dept.rooms.length === 0) continue;

      // 找该部门第一个未评分办公室
      const roomIndex = dept.rooms.findIndex((room: string) => !this.isOfficeScored(date, dept.name, room));
      if (roomIndex >= 0) {
        return { deptIndex: idx, roomIndex };
      }
    }

    return null;
  },

  resetScores() {
    const scores = {} as ScoreMap;
    SCORING_ITEMS.forEach((item) => {
      scores[item] = { score: null, images: [], remark: '' };
    });

    this.setData({
      scores,
      totalScore: 0,
      scoredCount: 0,
    });
  },

  // 初始化表单
  async initForm() {
    // 设置默认日期为今天
    const today = this.formatDate(new Date());
    
    // 初始化评分数据
    const scores = {} as ScoreMap;
    SCORING_ITEMS.forEach((item) => {
      scores[item] = { score: null, images: [], remark: '' };
    });

    this.setData({
      date: today,
      scores,
      totalScore: 0,
      scoredCount: 0,
    });

    await this.loadScoredOffices(today);

    // 加载部门数据
    await this.loadDepartments();
  },

  async loadScoredOffices(date: string) {
    try {
      const db = wx.cloud.database();
      const res = await db
        .collection('inspections')
        .where({ date })
        .field({ department: true, room: true })
        .limit(1000)
        .get();

      const keys = (res.data || [])
        .map((r: Record<string, unknown>) => this.makeScoredOfficeKey(String(r.department || ''), String(r.room || '')))
        .filter((k: string) => !!k);

      this.setData({ scoredOfficeKeys: Array.from(new Set(keys)) });
    } catch (err) {
      // 如果 inspections 集合不存在或权限不足，这里不阻塞打分流程
      console.error('加载当天已评分办公室失败', err);
      this.setData({ scoredOfficeKeys: [] });
    }
  },

  // 加载部门数据（从云数据库加载）
  async loadDepartments() {
    try {
      // 调用云函数获取所有部门
      const deptRes = await wx.cloud.callFunction({
        name: 'manageDepartments',
        data: { action: 'list' }
      });

      const deptResult = deptRes.result as unknown as { success?: boolean; departments?: Array<{ _id: string; name: string }> };

      if (!deptResult?.success || !Array.isArray(deptResult.departments)) {
        throw new Error('获取部门数据失败');
      }

      const depts = deptResult.departments;

      // 调用云函数获取所有办公室
      const roomsRes = await wx.cloud.callFunction({
        name: 'manageRooms',
        data: { action: 'listAll' }
      });

      const roomsResult = roomsRes.result as unknown as { rooms?: RoomRecord[] };

      const rooms = Array.isArray(roomsResult.rooms) ? roomsResult.rooms : [];
      const roomMap = new Map<string, string[]>();
      rooms.forEach((r: RoomRecord) => {
        if (!roomMap.has(r.departmentId)) {
          roomMap.set(r.departmentId, []);
        }
        roomMap.get(r.departmentId)!.push(r.name);
      });

      // 组装部门数据结构
      const departments = depts.map((d: { _id: string; name: string }) => ({
        _id: d._id,
        name: d.name,
        rooms: roomMap.get(d._id) || []
      }));

      if (departments.length === 0) {
        this.setData({ 
          departments: [],
          loading: false 
        });
        wx.showModal({
          title: '提示',
          content: '数据库中暂无部门数据，请先到管理页面进行初始化。',
          showCancel: false,
          confirmText: '去初始化',
          success: (res) => {
            if (res.confirm) {
              wx.navigateTo({
                url: '/pages/admin/departments/departments'
              });
            }
          }
        });
        return;
      }

      // 默认显示当天第一个未评分的部门/办公室
      let deptIndex = 0;
      let roomIndex = 0;
      let selectedDept = departments[0]?.name || '';
      let selectedRoom = departments[0]?.rooms[0] || '';

      // 找第一个未评分的办公室
      for (let d = 0; d < departments.length; d++) {
        const dept = departments[d];
        const rIdx = (dept.rooms || []).findIndex((room: string) => !this.hasOfficeScored(dept.name, room));
        if (rIdx >= 0) {
          deptIndex = d;
          roomIndex = rIdx;
          selectedDept = dept.name;
          selectedRoom = dept.rooms[rIdx];
          break;
        }
      }

      this.setData({
        departments,
        deptIndex,
        roomIndex,
        selectedDept,
        selectedRoom,
        loading: false,
      });
    } catch (err) {
      console.error('加载部门数据失败', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载数据失败', icon: 'error' });
    }
  },

  // 格式化日期
  formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 日期选择
  onDateChange(e: { detail: { value: string } }) {
    this.setData({ date: e.detail.value });
  },

  // 部门选择
  onDeptChange(e: { detail: { value: string } }) {
    const index = parseInt(e.detail.value);
    const dept = this.data.departments[index];
    this.setData({
      deptIndex: index,
      roomIndex: 0,
      selectedDept: dept.name,
      selectedRoom: dept.rooms[0] || '',
    });
  },

  // 办公室选择
  onRoomChange(e: { detail: { value: string } }) {
    const index = parseInt(e.detail.value);
    const dept = this.data.departments[this.data.deptIndex];
    this.setData({
      roomIndex: index,
      selectedRoom: dept.rooms[index] || '',
    });
  },

  // 计算总分
  calculateTotal(scores?: ScoreMap): number {
    const targetScores = scores || this.data.scores;
    const values = Object.values(targetScores) as ScoreItem[];
    return values.reduce<number>((sum, item) => sum + (Number(item.score) || 0), 0);
  },

  // 计算已评项目数
  calculateScoredCount(scores?: ScoreMap): number {
    const targetScores = scores || this.data.scores;
    const values = Object.values(targetScores) as ScoreItem[];
    return values.filter((item) => item.score !== null && item.score !== undefined).length;
  },

  // 判断是否为低分
  isLowScore(item: ScoringItem): boolean {
    const score = this.data.scores[item]?.score;
    if (score === null || score === undefined || score === '') return false;
    return Number(score) <= SCORING_LOW_THRESHOLDS[item];
  },

  // 设置分数（公共方法）
  setScore(item: ScoringItem, score: number | null) {
    const maxScore = SCORING_MAX_SCORES[item];
    
    // 边界校验
    if (score !== null) {
      if (score < 0) score = 0;
      if (score > maxScore) score = maxScore;
    }

    const scores = { ...this.data.scores };
    scores[item] = { ...scores[item], score };
    const totalScore = this.calculateTotal(scores);
    const scoredCount = this.calculateScoredCount(scores);
    this.setData({ scores, totalScore, scoredCount });
  },

  // 增加分数
  increaseScore(e: { currentTarget: { dataset: { item: ScoringItem } } }) {
    const { item } = e.currentTarget.dataset;
    const currentScore = this.data.scores[item].score;
    const maxScore = SCORING_MAX_SCORES[item];
    
    let newScore: number;
    if (currentScore === null || currentScore === undefined || currentScore === '') {
      newScore = maxScore; // 从满分开始
    } else {
      newScore = Math.min(Number(currentScore) + 1, maxScore);
    }
    
    this.setScore(item, newScore);
  },

  // 减少分数
  decreaseScore(e: { currentTarget: { dataset: { item: ScoringItem } } }) {
    const { item } = e.currentTarget.dataset;
    const currentScore = this.data.scores[item].score;
    
    if (currentScore === null || currentScore === undefined || currentScore === '') {
      this.setScore(item, 0);
      return;
    }
    
    const newScore = Math.max(Number(currentScore) - 1, 0);
    this.setScore(item, newScore);
  },

  // 快捷标签点击
  onQuickTagTap(e: { currentTarget: { dataset: { item: ScoringItem; value: number | string } } }) {
    const { item, value } = e.currentTarget.dataset;
    this.setScore(item, Number(value));
  },

  // 输入分数
  onScoreInput(e: { currentTarget: { dataset: { item: ScoringItem } }; detail: { value: string } }) {
    const item = e.currentTarget.dataset.item as ScoringItem;
    const value = e.detail.value;
    const score = value === '' ? null : Number(value);

    if (score !== null && Number.isNaN(score)) {
      wx.showToast({ title: '请输入有效数字', icon: 'none' });
      return;
    }

    // 实时更新但不立即校验边界（等失焦时校验）
    const scores = { ...this.data.scores };
    scores[item] = { ...scores[item], score };
    const totalScore = this.calculateTotal(scores);
    const scoredCount = this.calculateScoredCount(scores);
    this.setData({ scores, totalScore, scoredCount });
  },

  // 输入框失焦时校验
  onScoreBlur(e: { currentTarget: { dataset: { item: ScoringItem } }; detail: { value: string } }) {
    const item = e.currentTarget.dataset.item as ScoringItem;
    const value = e.detail.value;
    const maxScore = SCORING_MAX_SCORES[item];
    
    let score = value === '' ? null : Number(value);
    
    if (score !== null) {
      if (Number.isNaN(score)) {
        this.setScore(item, null);
        return;
      }
      
      // 自动修正超出范围的值
      if (score < 0) {
        score = 0;
        wx.showToast({ title: '分数不能为负数，已修正为0', icon: 'none' });
      } else if (score > maxScore) {
        score = maxScore;
        wx.showToast({ title: `最高不能超过${maxScore}分，已修正`, icon: 'none' });
      }
    }
    
    this.setScore(item, score);
  },

  onRemarkInput(e: { currentTarget: { dataset: { item: ScoringItem } }; detail: { value: string } }) {
    const item = e.currentTarget.dataset.item as ScoringItem;
    const remark = e.detail.value;
    const page = this as unknown as ScorePageThis;
    if (typeof page.debouncedUpdateRemark === 'function') {
      page.debouncedUpdateRemark(item, remark);
    }
  },

  // 选择图片（带压缩）
  async chooseImage(e: { currentTarget: { dataset: { item: ScoringItem } } }) {
    const item = e.currentTarget.dataset.item as ScoringItem;
    const currentImages = this.data.scores[item].images;
    
    if (currentImages.length >= 3) {
      wx.showToast({ title: '最多上传3张照片', icon: 'none' });
      return;
    }

    try {
      const res = await wx.chooseImage({
        count: 3 - currentImages.length,
        sizeType: ['original'], // 先选原图，后面手动压缩
        sourceType: ['album', 'camera'],
      });

      wx.showLoading({ title: '压缩上传中...' });
      
      // 压缩图片后再上传
      const uploadPromises = res.tempFilePaths.map(async (filePath: string) => {
        // 压缩图片（质量 80%，宽度不超过 1080px）
        let compressedPath = filePath;
        try {
          const compressRes = await wx.compressImage({
            src: filePath,
            quality: 80,
            compressedWidth: 1080,
          });
          compressedPath = compressRes.tempFilePath;
        } catch (compressErr) {
          console.warn('图片压缩失败，使用原图', compressErr);
          // 压缩失败则使用原图
        }
        
        const cloudPath = `inspections/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
        return wx.cloud.uploadFile({
          cloudPath,
          filePath: compressedPath,
        });
      });

      const results = await Promise.all(uploadPromises);
      const newFileIDs = results
        .map((r) => r.fileID)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
      
      const scores = { ...this.data.scores };
      scores[item] = {
        ...scores[item],
        images: [...currentImages, ...newFileIDs],
      };

      this.setData({ scores });
      wx.hideLoading();
    } catch (err) {
      console.error('上传图片失败', err);
      wx.hideLoading();
      wx.showToast({ title: '上传失败', icon: 'error' });
    }
  },

  // 删除图片
  deleteImage(e: { currentTarget: { dataset: { item: ScoringItem; index: number | string } } }) {
    const item = e.currentTarget.dataset.item as ScoringItem;
    const index = Number(e.currentTarget.dataset.index);
    const scores = { ...this.data.scores };
    const images = [...scores[item].images];
    images.splice(index, 1);
    scores[item] = { ...scores[item], images };
    this.setData({ scores });
  },

  // 预览图片
  previewImage(e: { currentTarget: { dataset: { url?: string; item: ScoringItem } } }) {
    const url = String(e.currentTarget.dataset.url || '');
    const item = e.currentTarget.dataset.item as ScoringItem;
    const images = this.data.scores[item].images;
    wx.previewImage({
      current: url,
      urls: images,
    });
  },

  // 校验表单
  validateForm(): boolean {
    if (!this.data.selectedDept || !this.data.selectedRoom) {
      wx.showToast({ title: '请选择部门和办公室', icon: 'none' });
      return false;
    }

    for (const item of SCORING_ITEMS) {
      const data = this.data.scores[item];
      const maxScore = SCORING_MAX_SCORES[item];
      const lowScoreThreshold = SCORING_LOW_THRESHOLDS[item];
      
      if (data.score === null) {
        wx.showToast({ title: `请为"${item}"打分`, icon: 'none' });
        this.scrollToItem(item);
        return false;
      }

      if (data.score > maxScore) {
        wx.showToast({ title: `"${item}"得分不能超过${maxScore}分`, icon: 'none' });
        this.scrollToItem(item);
        return false;
      }

      // 得分 <= 低分阈值 必须上传照片或填写备注
      if (data.score <= lowScoreThreshold && data.images.length === 0 && !data.remark.trim()) {
        wx.showToast({ title: `"${item}"得分≤${lowScoreThreshold}分，必须上传照片或填写备注`, icon: 'none' });
        this.scrollToItem(item);
        return false;
      }
    }

    return true;
  },

  // 滚动到指定项
  scrollToItem(item: string) {
    const query = this.createSelectorQuery();
    query.select(`#item-${item}`).boundingClientRect();
    query.selectViewport().scrollOffset();
    query.exec((res: unknown[]) => {
      const rect = res[0] as { top?: number } | undefined;
      const viewport = res[1] as { scrollTop?: number } | undefined;
      if (rect?.top !== undefined && viewport?.scrollTop !== undefined) {
        wx.pageScrollTo({
          scrollTop: viewport.scrollTop + rect.top - 100,
          duration: 300,
        });
      }
    });
  },

  // 提交评分
  async submit() {
    if (!this.validateForm()) return;

    // 同一天同办公室重复提交提醒
    if (this.isOfficeScored(this.data.date, this.data.selectedDept, this.data.selectedRoom)) {
      const confirmRes = await wx.showModal({
        title: '提示',
        content: '该办公室今天已评分过，确定要重新提交评分吗？',
        confirmText: '继续提交',
        cancelText: '取消',
      });
      if (!confirmRes.confirm) return;
    }

    this.setData({ submitting: true });

    try {
      const details = SCORING_ITEMS.map(item => ({
        item,
        score: this.data.scores[item].score as number,
        images: this.data.scores[item].images,
        remark: this.data.scores[item].remark,
      }));

      // 调用云函数提交评分（实现覆盖逻辑）
      const res = await wx.cloud.callFunction({
        name: 'submitInspection',
        data: {
          date: this.data.date,
          checkerId: app.globalData.userInfo?.nickName || '匿名检查员',
          checkerName: app.globalData.userInfo?.nickName || '匿名检查员',
          department: this.data.selectedDept,
          room: this.data.selectedRoom,
          totalScore: this.calculateTotal(),
          details,
        }
      });

      const result = res.result as { success?: boolean; message?: string; _id?: string; isOverwrite?: boolean };

      if (!result?.success) {
        throw new Error(result?.message || '提交失败');
      }

      // 如果覆盖已有评分，显示提示
      if (result.isOverwrite) {
        wx.showToast({ 
          title: '评分已更新', 
          icon: 'success',
          duration: 2000 
        });
      }

      // 记录为已评分（用于同部门自动切换与重复提交提醒）
      const newKey = this.makeScoredOfficeKey(this.data.selectedDept, this.data.selectedRoom);
      const updatedScoredKeys = Array.from(new Set([...this.data.scoredOfficeKeys, newKey]));
      this.setData({
        scoredOfficeKeys: updatedScoredKeys,
      });

      // 计算办公室统计（使用更新后的已评分列表）
      const totalOffices = this.data.departments.reduce((sum, dept) => sum + (dept.rooms?.length || 0), 0);
      const scoredCount = updatedScoredKeys.length;

      // 提交成功
      this.setData({
        submitted: true,
        submittedData: {
          _id: String(result._id || ''),
          date: this.data.date,
          checkerId: app.globalData.userInfo?.nickName || '匿名检查员',
          checkerName: app.globalData.userInfo?.nickName || '匿名检查员',
          department: this.data.selectedDept,
          room: this.data.selectedRoom,
          totalScore: this.calculateTotal(),
          details,
          scoredCount,
          totalOffices,
        },
        submitting: false,
      });

      // 自动切换到同部门下一个未评分办公室（如果存在）
      const next = this.getNextRoomInDept(this.data.deptIndex, this.data.roomIndex);
      if (next) {
        const rooms = this.data.departments[this.data.deptIndex].rooms;
        const nextRoomIndex = rooms.findIndex((r: string) => r === next.room);
        if (nextRoomIndex >= 0) {
          this.setData({
            roomIndex: nextRoomIndex,
            selectedRoom: next.room,
          });
          this.resetScores();
        }
      } else {
        // 当前部门全部办公室已评分：切换到下一个未评分部门
        const nextDept = this.getNextUnscoredDept(this.data.deptIndex);
        if (nextDept) {
          const dept = this.data.departments[nextDept.deptIndex];
          const room = dept.rooms[nextDept.roomIndex];
          this.setData({
            deptIndex: nextDept.deptIndex,
            roomIndex: nextDept.roomIndex,
            selectedDept: dept.name,
            selectedRoom: room,
          });
          this.resetScores();
        }
      }
    } catch (err) {
      console.error('提交失败', err);
      this.setData({ submitting: false });
      wx.showToast({ title: '提交失败，请重试', icon: 'error' });
    }
  },

  // 查看详情
  viewDetail() {
    const data = this.data.submittedData;
    wx.setStorageSync('inspectionDetail', data);
    wx.navigateTo({ url: '/pages/inspection-detail/inspection-detail' });
  },

  // 返回首页
  goHome() {
    wx.switchTab({ url: '/pages/home/home' });
  },

  // 继续打分
  continueScore() {
    this.setData({ submitted: false, submittedData: null });
    this.initForm();
    // 滚动到页面顶部
    wx.pageScrollTo({
      scrollTop: 0,
      duration: 300,
    });
  },
});

