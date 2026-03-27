import { useEffect, useState } from 'react';
import { collection, query, orderBy, getDocs, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Search, Calendar, Building2, ChevronRight, Download } from 'lucide-react';
import { format } from 'date-fns';

interface Inspection {
  id: string;
  department: string;
  room: string;
  totalScore: number;
  date: string;
  checkerName: string;
  details: any[];
}

export default function History() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedInspection, setSelectedInspection] = useState<Inspection | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const inspectionsRef = collection(db, 'inspections');
        // Simple query ordered by createdAt descending
        const q = query(inspectionsRef, orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Inspection));
        setInspections(data);
      } catch (error) {
        console.error('Error fetching history:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, []);

  const filteredInspections = inspections.filter(item => {
    const searchLower = searchTerm.toLowerCase();
    const matchSearch = 
      item.department.toLowerCase().includes(searchLower) ||
      (item.checkerName && item.checkerName.toLowerCase().includes(searchLower)) ||
      item.date.includes(searchLower);
    
    const matchMonth = item.date.startsWith(selectedMonth);
    return matchSearch && matchMonth;
  });

  const exportToCSV = () => {
    if (filteredInspections.length === 0) return;

    const headers = ['部门', '房间', '日期', '检查员', '总分'];
    const csvRows = [headers.join(',')];

    filteredInspections.forEach(item => {
      const row = [
        `"${item.department}"`,
        `"${item.room}"`,
        `"${item.date}"`,
        `"${item.checkerName || ''}"`,
        item.totalScore
      ];
      csvRows.push(row.join(','));
    });

    // Add BOM for Excel UTF-8 compatibility
    const csvContent = '\uFEFF' + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `7S检查记录_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-4 space-y-6 pb-24">
      <header className="mb-6 flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">历史数据查询</h1>
          <p className="text-sm text-gray-500">查看过往打分记录</p>
        </div>
        <button
          onClick={exportToCSV}
          disabled={filteredInspections.length === 0}
          className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          <Download className="w-4 h-4" />
          导出CSV
        </button>
      </header>

      {/* Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="搜索部门、检查员或日期..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
          />
        </div>
        
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
          />
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : filteredInspections.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-gray-100 border-dashed">
            <p className="text-gray-500">没有找到相关记录</p>
          </div>
        ) : (
          filteredInspections.map((item) => (
            <div 
              key={item.id} 
              onClick={() => setSelectedInspection(item)}
              className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="bg-blue-50 p-2 rounded-lg text-blue-600 mt-1">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">{item.department}</h3>
                  <p className="text-xs text-gray-500 mb-1">{item.room}</p>
                  <div className="flex items-center gap-2 text-[10px] text-gray-400">
                    <span>{item.date}</span>
                    <span>•</span>
                    <span>检查员: {item.checkerName}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-xl font-bold text-blue-600">{item.totalScore}分</div>
                <ChevronRight className="w-5 h-5 text-gray-300" />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Detail Modal */}
      {selectedInspection && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[85vh] flex flex-col">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-2xl sm:rounded-t-2xl">
              <div>
                <h3 className="font-bold text-lg">{selectedInspection.department}</h3>
                <p className="text-sm text-gray-500">{selectedInspection.room} - {selectedInspection.date}</p>
              </div>
              <button 
                onClick={() => setSelectedInspection(null)}
                className="p-2 text-gray-500 hover:bg-gray-200 rounded-full bg-white shadow-sm"
              >
                ✕
              </button>
            </div>
            
            <div className="p-4 border-b flex justify-between items-center">
              <span className="text-gray-600">总分</span>
              <span className="text-2xl font-bold text-blue-600">{selectedInspection.totalScore}分</span>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              <h4 className="font-bold text-gray-900 mb-2">打分明细</h4>
              {selectedInspection.details.map((detail, idx) => (
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
