import { useEffect, useState } from 'react';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis 
} from 'recharts';
import { TrendingUp, Building2, AlertTriangle } from 'lucide-react';

interface Inspection {
  id: string;
  department: string;
  room: string;
  totalScore: number;
  date: string;
  details: { item: string; score: number }[];
}

export default function Analytics() {
  const [loading, setLoading] = useState(true);
  const [trendData, setTrendData] = useState<any[]>([]);
  const [deptData, setDeptData] = useState<any[]>([]);
  const [issueData, setIssueData] = useState<any[]>([]);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const q = query(collection(db, 'inspections'), orderBy('date', 'asc'));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Inspection));

        if (data.length === 0) {
          setLoading(false);
          return;
        }

        // 1. Trend Data (Average Score by Date)
        const dateGroups: Record<string, { total: number; count: number }> = {};
        data.forEach(ins => {
          if (!dateGroups[ins.date]) dateGroups[ins.date] = { total: 0, count: 0 };
          dateGroups[ins.date].total += ins.totalScore;
          dateGroups[ins.date].count += 1;
        });
        const trends = Object.keys(dateGroups).map(date => ({
          date: date.substring(5), // MM-DD
          averageScore: Math.round((dateGroups[date].total / dateGroups[date].count) * 10) / 10
        }));

        // 2. Department Data (Average Score by Department)
        const deptGroups: Record<string, { total: number; count: number }> = {};
        data.forEach(ins => {
          if (!deptGroups[ins.department]) deptGroups[ins.department] = { total: 0, count: 0 };
          deptGroups[ins.department].total += ins.totalScore;
          deptGroups[ins.department].count += 1;
        });
        const depts = Object.keys(deptGroups).map(dept => ({
          department: dept,
          averageScore: Math.round((deptGroups[dept].total / deptGroups[dept].count) * 10) / 10
        })).sort((a, b) => b.averageScore - a.averageScore);

        // 3. Issue Data (Average Score per Item)
        const itemGroups: Record<string, { total: number; count: number }> = {};
        data.forEach(ins => {
          ins.details.forEach(detail => {
            if (!itemGroups[detail.item]) itemGroups[detail.item] = { total: 0, count: 0 };
            itemGroups[detail.item].total += detail.score;
            itemGroups[detail.item].count += 1;
          });
        });
        const issues = Object.keys(itemGroups).map(item => ({
          item: item,
          averageScore: Math.round((itemGroups[item].total / itemGroups[item].count) * 10) / 10
        })).sort((a, b) => a.averageScore - b.averageScore); // Sort ascending to show worst first

        setTrendData(trends);
        setDeptData(depts);
        setIssueData(issues);
      } catch (error) {
        console.error('Error fetching analytics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full pt-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (trendData.length === 0) {
    return (
      <div className="p-4 space-y-6 pb-24">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">数据分析</h1>
          <p className="text-sm text-gray-500">多维度查看7S联查情况</p>
        </header>
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-100 border-dashed">
          <p className="text-gray-500">暂无足够的数据生成图表</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 pb-24">
      <header className="mb-2">
        <h1 className="text-2xl font-bold text-gray-900">数据分析</h1>
        <p className="text-sm text-gray-500">多维度查看7S联查情况</p>
      </header>

      {/* Trend Chart */}
      <section className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-blue-500" />
          <h2 className="font-bold text-gray-900">整体趋势 (平均分)</h2>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} dy={10} />
              <YAxis domain={[0, 70]} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} />
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                formatter={(value: number) => [`${value} 分`, '平均分']}
                labelFormatter={(label) => `日期: ${label}`}
              />
              <Line type="monotone" dataKey="averageScore" stroke="#3B82F6" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Department Comparison */}
      <section className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="w-5 h-5 text-indigo-500" />
          <h2 className="font-bold text-gray-900">各部门平均分对比</h2>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={deptData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis dataKey="department" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6B7280' }} dy={10} interval={0} angle={-30} textAnchor="end" height={50} />
              <YAxis domain={[0, 70]} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} />
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                formatter={(value: number) => [`${value} 分`, '平均分']}
                cursor={{ fill: '#F3F4F6' }}
              />
              <Bar dataKey="averageScore" fill="#6366F1" radius={[4, 4, 0, 0]} barSize={30} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Common Issues Radar */}
      <section className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-orange-500" />
          <h2 className="font-bold text-gray-900">扣分重灾区 (单项平均分)</h2>
        </div>
        <p className="text-xs text-gray-500 mb-2">分数越低代表该项扣分越严重</p>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={issueData}>
              <PolarGrid stroke="#E5E7EB" />
              <PolarAngleAxis dataKey="item" tick={{ fontSize: 10, fill: '#4B5563' }} />
              <PolarRadiusAxis angle={30} domain={[0, 10]} tick={{ fontSize: 10, fill: '#9CA3AF' }} />
              <Radar name="平均得分" dataKey="averageScore" stroke="#F97316" fill="#F97316" fillOpacity={0.5} />
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                formatter={(value: number) => [`${value} 分`, '平均得分']}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
