import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { Camera, CheckCircle2, ChevronDown, Save, AlertTriangle, Home, FileText, Plus } from 'lucide-react';
import ImageUpload from '../components/ImageUpload';

const SCORING_ITEMS = [
  '桌面摆放',
  '地面',
  '窗台',
  '文件资料',
  '电器设备',
  '办公椅',
  '整体印象'
] as const;

type ScoringItem = (typeof SCORING_ITEMS)[number];

type ScoreItem = {
  score: number | null;
  images: string[];
  remark: string;
};

type SubmittedInspection = {
  id: string;
  date: string;
  checkerId?: string;
  checkerName: string;
  department: string;
  room: string;
  totalScore: number;
  details: Array<{ item: string; score: number; images: string[]; remark: string }>;
};

const SCORE_OPTIONS = [10, 8, 4, 2];

interface Department {
  id: string;
  name: string;
  rooms: string[];
}

export default function Score() {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedRoom, setSelectedRoom] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  
  const [scores, setScores] = useState<Record<ScoringItem, ScoreItem>>(() => {
    const initial = {} as Record<ScoringItem, ScoreItem>;
    SCORING_ITEMS.forEach((item) => {
      initial[item] = { score: null, images: [], remark: '' };
    });
    return initial;
  });

  const [submitting, setSubmitting] = useState(false);
  const [submittedData, setSubmittedData] = useState<SubmittedInspection | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const fetchDepartments = async () => {
      const snapshot = await getDocs(collection(db, 'departments'));
      let depts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department));
      
      setDepartments(depts);
      if (depts.length > 0) {
        setSelectedDept(depts[0].name);
        if (depts[0].rooms.length > 0) {
          setSelectedRoom(depts[0].rooms[0]);
        }
      }
    };
    fetchDepartments();
  }, []);

  const handleScoreChange = (item: ScoringItem, score: number) => {
    setScores(prev => ({
      ...prev,
      [item]: { ...prev[item], score }
    }));
  };

  const handleRemarkChange = (item: ScoringItem, remark: string) => {
    setScores(prev => ({
      ...prev,
      [item]: { ...prev[item], remark }
    }));
  };

  const handleImagesChange = (item: ScoringItem, images: string[]) => {
    setScores(prev => ({
      ...prev,
      [item]: { ...prev[item], images }
    }));
  };

  const calculateTotal = () => {
    return (Object.values(scores) as ScoreItem[]).reduce((sum, current) => sum + (current.score || 0), 0);
  };

  const validateForm = () => {
    if (!selectedDept || !selectedRoom) {
      alert('请选择部门和办公室');
      return false;
    }

    for (const item of SCORING_ITEMS) {
      const data = scores[item];
      if (data.score === null) {
        alert(`请为“${item}”打分`);
        const element = document.getElementById(`score-item-${item}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return false;
      }
      if (data.score <= 4 && data.images.length === 0 && !data.remark.trim()) {
        alert(`“${item}”得分≤4分，必须上传照片或填写备注说明原因`);
        const element = document.getElementById(`score-item-${item}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    
    setSubmitting(true);
    try {
      const details = SCORING_ITEMS.map(item => ({
        item,
        score: scores[item].score as number,
        images: scores[item].images,
        remark: scores[item].remark
      }));

      const docRef = await addDoc(collection(db, 'inspections'), {
        date,
        checkerId: auth.currentUser?.uid,
        checkerName: auth.currentUser?.displayName || '匿名检查员',
        department: selectedDept,
        room: selectedRoom,
        totalScore: calculateTotal(),
        details,
        createdAt: serverTimestamp()
      });

      setSubmittedData({
        id: docRef.id,
        date,
        checkerId: auth.currentUser?.uid,
        checkerName: auth.currentUser?.displayName || '匿名检查员',
        department: selectedDept,
        room: selectedRoom,
        totalScore: calculateTotal(),
        details,
      });
    } catch (error) {
      console.error('Error submitting inspection:', error);
      alert('提交失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const currentDeptObj = departments.find(d => d.name === selectedDept);

  const resetForm = () => {
    setSubmittedData(null);
    setShowDetails(false);
    const initial = {} as Record<ScoringItem, ScoreItem>;
    SCORING_ITEMS.forEach((item) => {
      initial[item] = { score: null, images: [], remark: '' };
    });
    setScores(initial);
  };

  if (submittedData) {
    return (
      <div className="p-4 space-y-6 pb-24 flex flex-col items-center justify-center min-h-[80vh]">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 text-center max-w-sm w-full">
          <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">提交成功</h2>
          <p className="text-gray-500 mb-6">
            {submittedData.department} - {submittedData.room}
            <br />
            总分: <span className="text-blue-600 font-bold text-xl">{submittedData.totalScore}</span> 分
          </p>
          
          <div className="space-y-3">
            <button
              onClick={() => setShowDetails(true)}
              className="w-full flex items-center justify-center gap-2 bg-blue-50 text-blue-600 py-3 rounded-xl font-bold hover:bg-blue-100 transition-colors"
            >
              <FileText className="w-5 h-5" />
              查看详情
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-full flex items-center justify-center gap-2 bg-gray-50 text-gray-600 py-3 rounded-xl font-bold hover:bg-gray-100 transition-colors"
            >
              <Home className="w-5 h-5" />
              返回首页
            </button>
            <button
              onClick={resetForm}
              className="w-full flex items-center justify-center gap-2 text-gray-400 py-3 text-sm hover:text-gray-600 transition-colors mt-2"
            >
              <Plus className="w-4 h-4" />
              继续打分
            </button>
          </div>
        </div>

        {/* Detail Modal */}
        {showDetails && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
            <div className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[85vh] flex flex-col text-left">
              <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-2xl sm:rounded-t-2xl">
                <div>
                  <h3 className="font-bold text-lg">{submittedData.department}</h3>
                  <p className="text-sm text-gray-500">{submittedData.room} - {submittedData.date}</p>
                </div>
                <button 
                  onClick={() => setShowDetails(false)}
                  className="p-2 text-gray-500 hover:bg-gray-200 rounded-full bg-white shadow-sm"
                >
                  ✕
                </button>
              </div>
              
              <div className="p-4 border-b flex justify-between items-center">
                <span className="text-gray-600">总分</span>
                <span className="text-2xl font-bold text-blue-600">{submittedData.totalScore}分</span>
              </div>

              <div className="p-4 overflow-y-auto flex-1 space-y-4">
                <h4 className="font-bold text-gray-900 mb-2">打分明细</h4>
                {submittedData.details.map((detail, idx: number) => (
                  <div key={idx} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium text-gray-900">{detail.item}</span>
                      <span className={`font-bold ${detail.score <= 4 ? 'text-red-600' : 'text-green-600'}`}>
                        {detail.score}分
                      </span>
                    </div>
                    {detail.remark && (
                      <p className="text-sm text-gray-600 mb-3 bg-gray-50 p-2 rounded-lg border border-gray-100">
                        {detail.remark}
                      </p>
                    )}
                    {detail.images && detail.images.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {detail.images.map((img: string, i: number) => (
                          <img 
                            key={i} 
                            src={img} 
                            alt="现场照片" 
                            className="w-20 h-20 object-cover rounded-lg flex-shrink-0 border border-gray-200"
                            referrerPolicy="no-referrer"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="pb-24">
      {/* Header Info */}
      <div className="bg-white px-4 py-4 sticky top-0 z-40 shadow-sm border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-900 mb-4">现场检查打分</h1>
        
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">检查日期</label>
              <input 
                type="date" 
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
          
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <label className="block text-xs font-medium text-gray-500 mb-1">部门</label>
              <select 
                value={selectedDept}
                onChange={(e) => {
                  setSelectedDept(e.target.value);
                  const newDept = departments.find(d => d.name === e.target.value);
                  if (newDept && newDept.rooms.length > 0) {
                    setSelectedRoom(newDept.rooms[0]);
                  } else {
                    setSelectedRoom('');
                  }
                }}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm appearance-none focus:ring-2 focus:ring-blue-500 outline-none"
              >
                {departments.map(d => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-[26px] w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
            
            <div className="flex-1 relative">
              <label className="block text-xs font-medium text-gray-500 mb-1">办公室</label>
              <select 
                value={selectedRoom}
                onChange={(e) => setSelectedRoom(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm appearance-none focus:ring-2 focus:ring-blue-500 outline-none"
              >
                {currentDeptObj?.rooms.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-[26px] w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Scoring Form */}
      <div className="p-4 space-y-4">
        {SCORING_ITEMS.map((item, index) => {
          const itemData = scores[item];
          const needsExplanation = itemData.score !== null && itemData.score <= 4;
          
          return (
            <div key={item} id={`score-item-${item}`} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </span>
                  <h3 className="font-bold text-gray-900">{item}</h3>
                </div>
              </div>

              <div className="flex gap-2 mb-4">
                {SCORE_OPTIONS.map(score => (
                  <button
                    key={score}
                    onClick={() => handleScoreChange(item, score)}
                    className={`flex-1 py-2 rounded-lg font-medium text-sm transition-all ${
                      itemData.score === score 
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-200 scale-[1.02]' 
                        : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {score}分
                  </button>
                ))}
              </div>

              {/* Photo & Remark Section */}
              <div className="space-y-3">
                <textarea
                  placeholder={needsExplanation ? "请填写扣分原因（必填）..." : "备注说明（选填）..."}
                  value={itemData.remark}
                  onChange={(e) => handleRemarkChange(item, e.target.value)}
                  className={`w-full bg-gray-50 border rounded-xl px-3 py-2 text-sm outline-none transition-colors resize-none h-20 ${
                    needsExplanation && !itemData.remark && itemData.images.length === 0
                      ? 'border-red-300 focus:ring-2 focus:ring-red-500' 
                      : 'border-gray-200 focus:ring-2 focus:ring-blue-500'
                  }`}
                />
                
                <ImageUpload 
                  images={itemData.images} 
                  onChange={(images) => handleImagesChange(item, images)} 
                />
                
                {needsExplanation && itemData.images.length === 0 && !itemData.remark && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    评分≤4分，必须上传照片或填写备注
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Submit Bar */}
      <div className="fixed bottom-[60px] left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-[0_-10px_20px_rgba(0,0,0,0.05)] flex items-center justify-between z-40">
        <div>
          <p className="text-xs text-gray-500">当前总计</p>
          <p className="text-2xl font-bold text-blue-600">{calculateTotal()} <span className="text-sm font-normal text-gray-500">分</span></p>
        </div>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-lg shadow-blue-200"
        >
          {submitting ? (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
          ) : (
            <>
              <Save className="w-5 h-5" />
              提交评分
            </>
          )}
        </button>
      </div>
    </div>
  );
}
