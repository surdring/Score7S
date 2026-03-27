import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, getDocs, onSnapshot } from 'firebase/firestore';
import { db, auth, logout } from '../firebase';
import { Trophy, LogOut, Image as ImageIcon, ShieldCheck, TrendingUp, TrendingDown, Inbox, ClipboardCheck, Crown, Sparkles, AlertOctagon, PartyPopper } from 'lucide-react';
import { format } from 'date-fns';

interface Inspection {
  id: string;
  department: string;
  room: string;
  totalScore: number;
  date: string;
  details: any[];
}

export default function Home() {
  const [redList, setRedList] = useState<Inspection[]>([]);
  const [blackList, setBlackList] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInspection, setSelectedInspection] = useState<Inspection | null>(null);

  useEffect(() => {
    const inspectionsRef = collection(db, 'inspections');
    
    // Fetch Red List (Top 3)
    const redQuery = query(inspectionsRef, orderBy('totalScore', 'desc'), limit(3));
    const unsubscribeRed = onSnapshot(redQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Inspection));
      setRedList(data);
    });

    // Fetch Black List (Bottom 3)
    const blackQuery = query(inspectionsRef, orderBy('totalScore', 'asc'), limit(3));
    const unsubscribeBlack = onSnapshot(blackQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Inspection));
      setBlackList(data);
      setLoading(false);
    });

    return () => {
      unsubscribeRed();
      unsubscribeBlack();
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full pt-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2 pb-24">
      <header className="mb-8 relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 p-6 text-white shadow-lg">
        <div className="relative z-10 flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ClipboardCheck className="w-6 h-6 text-blue-200" />
              <h1 className="text-2xl font-bold tracking-tight">7S联查看板</h1>
            </div>
            <p className="text-blue-100 text-sm font-medium opacity-90">最新一期检查结果与排名</p>
          </div>
          <button onClick={logout} className="p-2 text-white/80 hover:text-white hover:bg-white/20 rounded-full transition-colors backdrop-blur-sm">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
        
        {/* Decorative background elements */}
        <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-24 h-24 bg-blue-400 opacity-20 rounded-full blur-xl"></div>
      </header>

      {/* Red List */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="bg-orange-100 p-2 rounded-xl">
              <Crown className="w-5 h-5 text-orange-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">红榜 <span className="text-sm font-normal text-gray-500 ml-1">Top 3</span></h2>
          </div>
          <TrendingUp className="w-5 h-5 text-orange-500 opacity-50" />
        </div>
        
        <div className="space-y-3">
          {redList.length === 0 ? (
            <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-8 flex flex-col items-center justify-center text-center">
              <div className="bg-white p-3 rounded-full shadow-sm mb-3">
                <Sparkles className="w-6 h-6 text-yellow-500" />
              </div>
              <p className="text-gray-600 font-medium">暂无红榜数据</p>
              <p className="text-xs text-gray-400 mt-1">本期还没有产生高分部门</p>
            </div>
          ) : (
            redList.map((item, index) => (
              <div key={item.id} className="relative bg-white rounded-2xl p-4 shadow-sm border border-orange-100/50 flex justify-between items-center overflow-hidden group hover:shadow-md transition-all">
                {/* Background gradient for top 1 */}
                {index === 0 && <div className="absolute inset-0 bg-gradient-to-r from-orange-50 to-transparent opacity-50"></div>}
                
                <div className="relative z-10 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shadow-sm
                    ${index === 0 ? 'bg-gradient-to-br from-yellow-300 to-yellow-500 text-white' : 
                      index === 1 ? 'bg-gradient-to-br from-gray-200 to-gray-400 text-white' : 
                      'bg-gradient-to-br from-orange-200 to-orange-400 text-white'}`}>
                    {index + 1}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-base">{item.department}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{item.room}</p>
                  </div>
                </div>
                <div className="relative z-10 flex flex-col items-end">
                  <div className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-br from-orange-500 to-red-600">
                    {item.totalScore}
                  </div>
                  <span className="text-[10px] font-medium text-orange-600/70 uppercase tracking-wider">Score</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Black List */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="bg-red-100 p-2 rounded-xl">
              <AlertOctagon className="w-5 h-5 text-red-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">黑榜 <span className="text-sm font-normal text-gray-500 ml-1">Bottom 3</span></h2>
          </div>
          <TrendingDown className="w-5 h-5 text-red-500 opacity-50" />
        </div>
        
        <div className="space-y-3">
          {blackList.length === 0 ? (
            <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-8 flex flex-col items-center justify-center text-center">
              <div className="bg-white p-3 rounded-full shadow-sm mb-3">
                <PartyPopper className="w-6 h-6 text-green-500" />
              </div>
              <p className="text-gray-600 font-medium">暂无黑榜数据</p>
              <p className="text-xs text-gray-400 mt-1">大家表现都很棒，继续保持！</p>
            </div>
          ) : (
            blackList.map((item, index) => (
              <div 
                key={item.id} 
                onClick={() => setSelectedInspection(item)}
                className="bg-white rounded-2xl p-4 shadow-sm border border-red-100 flex justify-between items-center cursor-pointer hover:bg-red-50/50 hover:shadow-md transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center font-bold text-lg border border-red-100 group-hover:bg-red-100 transition-colors">
                    {index + 1}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-base">{item.department}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{item.room}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="text-2xl font-black text-red-600">{item.totalScore}</div>
                  <div className="text-[10px] font-medium text-red-500 bg-red-50 px-2 py-0.5 rounded-full border border-red-100">
                    查看扣分项
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Problem Exposure Modal */}
      {selectedInspection && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[80vh] flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <div>
                <h3 className="font-bold text-lg">{selectedInspection.department}</h3>
                <p className="text-sm text-gray-500">{selectedInspection.room} - {selectedInspection.date}</p>
              </div>
              <button 
                onClick={() => setSelectedInspection(null)}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-full"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              {selectedInspection.details.filter(d => d.score <= 4).map((detail, idx) => (
                <div key={idx} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium text-gray-900">{detail.item}</span>
                    <span className="text-red-600 font-bold">{detail.score}分</span>
                  </div>
                  {detail.remark && (
                    <p className="text-sm text-gray-600 mb-3 bg-white p-2 rounded-lg border border-gray-100">
                      {detail.remark}
                    </p>
                  )}
                  {detail.images && detail.images.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {detail.images.map((img: string, i: number) => (
                        <img 
                          key={i} 
                          src={img} 
                          alt="问题照片" 
                          className="w-24 h-24 object-cover rounded-lg flex-shrink-0 border border-gray-200"
                          referrerPolicy="no-referrer"
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {selectedInspection.details.filter(d => d.score <= 4).length === 0 && (
                <p className="text-center text-gray-500 py-8">没有严重扣分项 (≤4分)</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
