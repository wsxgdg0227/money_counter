import { useEffect, useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  CartesianGrid,
  Legend,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  XAxis,
  YAxis
} from 'recharts'

const STORAGE_KEY = 'bookkeeping_records_v1'

const EXPENSE_CATEGORIES = ['Food', 'Transport', 'Housing', 'Shopping', 'Entertainment', 'Medical', 'Education', 'Other']
const INCOME_CATEGORIES = ['Salary', 'Part-time', 'Investment', 'Bonus', 'Other']

const PIE_COLORS = ['#3B82F6', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#F97316', '#14B8A6']
const BEIJING_TIME_ZONE = 'Asia/Shanghai'

const getBeijingDateParts = (date) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BEIJING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date)

  const year = parts.find((part) => part.type === 'year')?.value ?? ''
  const month = parts.find((part) => part.type === 'month')?.value ?? ''
  const day = parts.find((part) => part.type === 'day')?.value ?? ''
  return { year, month, day }
}

const getBeijingDateString = (date) => {
  const { year, month, day } = getBeijingDateParts(date)
  return `${year}-${month}-${day}`
}

const shiftYmd = (ymd, deltaDays) => {
  const [year, month, day] = ymd.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day + deltaDays))
  const y = shifted.getUTCFullYear()
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const d = String(shifted.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const emptyForm = {
  amount: '',
  type: 'expense',
  category: 'Food',
  date: getBeijingDateString(new Date()),
  note: ''
}

function App() {
  const [records, setRecords] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [trendMode, setTrendMode] = useState('bar')
  const [showPiePercent, setShowPiePercent] = useState(false)

  /**
   * Initialize records from LocalStorage on first render.
   * Notes:
   * 1) LocalStorage stores only strings, so we parse JSON here.
   * 2) Use try/catch to avoid app crash on malformed data.
   */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        setRecords(parsed)
      }
    } catch (error) {
      console.error('Failed to read local data:', error)
    }
  }, [])

  /**
   * Persist records into LocalStorage whenever records change.
   */
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  }, [records])

  /**
   * Dynamic category list by transaction type.
   */
  const categoryOptions = useMemo(() => {
    return form.type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES
  }, [form.type])

  /**
   * Sort records by date desc, then by createdAt desc.
   */
  const sortedRecords = useMemo(() => {
    return [...records].sort((a, b) => {
      const dateDiff = new Date(b.date) - new Date(a.date)
      if (dateDiff !== 0) return dateDiff
      return new Date(b.createdAt) - new Date(a.createdAt)
    })
  }, [records])

  /**
   * KPI:
   * - Monthly income
   * - Monthly expense
   * - Current balance (all-time income - all-time expense)
   */
  const kpi = useMemo(() => {
    const currentYM = getBeijingDateString(new Date()).slice(0, 7)

    const currentMonthRecords = records.filter((r) => r.date.startsWith(currentYM))

    const monthIncome = currentMonthRecords
      .filter((r) => r.type === 'income')
      .reduce((sum, r) => sum + Number(r.amount), 0)

    const monthExpense = currentMonthRecords
      .filter((r) => r.type === 'expense')
      .reduce((sum, r) => sum + Number(r.amount), 0)

    const totalIncome = records
      .filter((r) => r.type === 'income')
      .reduce((sum, r) => sum + Number(r.amount), 0)

    const totalExpense = records
      .filter((r) => r.type === 'expense')
      .reduce((sum, r) => sum + Number(r.amount), 0)

    const balance = totalIncome - totalExpense

    return { monthIncome, monthExpense, balance }
  }, [records])

  /**
   * Pie chart data transformation:
   * 1) keep only expense records
   * 2) group by category and sum amount
   * 3) map into [{ name, value }] for Recharts Pie
   */
  const expensePieData = useMemo(() => {
    const grouped = records
      .filter((r) => r.type === 'expense')
      .reduce((acc, cur) => {
        const key = cur.category
        acc[key] = (acc[key] || 0) + Number(cur.amount)
        return acc
      }, {})

    return Object.entries(grouped).map(([name, value]) => ({ name, value }))
  }, [records])

  const totalExpenseValue = useMemo(() => {
    return expensePieData.reduce((sum, item) => sum + item.value, 0)
  }, [expensePieData])

  /**
   * Last-7-days trend transformation for Bar/Line charts:
   * 1) build a fixed 7-day skeleton with 0 defaults
   * 2) accumulate record amounts into matched day
   * 3) output [{ date, income, expense }]
   */
  const trend7DaysData = useMemo(() => {
    const days = []
    const dateMap = new Map()
    const todayYmd = getBeijingDateString(new Date())

    for (let i = 6; i >= 0; i--) {
      const isoDate = shiftYmd(todayYmd, -i)
      const label = isoDate.slice(5)

      const item = { date: label, income: 0, expense: 0, isoDate }
      days.push(item)
      dateMap.set(isoDate, item)
    }

    for (const record of records) {
      const target = dateMap.get(record.date)
      if (!target) continue
      if (record.type === 'income') {
        target.income += Number(record.amount)
      } else {
        target.expense += Number(record.amount)
      }
    }

    return days.map(({ date, income, expense }) => ({ date, income, expense }))
  }, [records])

  const formatMoney = (num) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'CNY',
      minimumFractionDigits: 2
    }).format(num)

  const handleTypeChange = (type) => {
    setForm((prev) => ({
      ...prev,
      type,
      category: type === 'expense' ? EXPENSE_CATEGORIES[0] : INCOME_CATEGORIES[0]
    }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const amountNum = Number(form.amount)

    if (!amountNum || amountNum <= 0) {
      alert('Please enter an amount greater than 0')
      return
    }

    const newRecord = {
      id: crypto.randomUUID(),
      amount: Number(amountNum.toFixed(2)),
      type: form.type,
      category: form.category,
      date: form.date,
      note: form.note.trim(),
      createdAt: new Date().toISOString()
    }

    setRecords((prev) => [newRecord, ...prev])
    setForm((prev) => ({
      ...emptyForm,
      type: prev.type,
      category: prev.type === 'expense' ? EXPENSE_CATEGORIES[0] : INCOME_CATEGORIES[0],
      date: getBeijingDateString(new Date())
    }))
  }

  const handleDelete = (id) => {
    setRecords((prev) => prev.filter((r) => r.id !== id))
  }

  const handleExport = () => {
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) {
      alert('No data to export')
      return
    }
    navigator.clipboard.writeText(data).then(() => {
      alert('Data copied to clipboard! Open the new site and click "Import Data" to paste it.')
    })
  }

  const handleImport = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text) return
      JSON.parse(text) // Validate JSON
      localStorage.setItem(STORAGE_KEY, text)
      setRecords(JSON.parse(text))
      alert('Data imported successfully!')
    } catch (err) {
      alert('Failed to import data. Make sure you copied valid data from the old site.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="mx-auto max-w-[1600px] px-6 py-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Personal Bookkeeping Dashboard</h1>
          <div className="space-x-4">
            <button
              onClick={handleExport}
              className="rounded border border-slate-300 bg-white px-3 py-1 text-sm hover:bg-slate-50"
            >
              Export Data (Copy)
            </button>
            <button
              onClick={handleImport}
              className="rounded border border-slate-300 bg-white px-3 py-1 text-sm hover:bg-slate-50"
            >
              Import Data (Paste)
            </button>
          </div>
        </div>

        <section className="mb-6 grid grid-cols-3 gap-4">
          <KpiCard title="Monthly Income" value={formatMoney(kpi.monthIncome)} color="text-emerald-600" />
          <KpiCard title="Monthly Expense" value={formatMoney(kpi.monthExpense)} color="text-rose-600" />
          <KpiCard title="Current Balance" value={formatMoney(kpi.balance)} color="text-brand-600" />
        </section>

        <section className="grid grid-cols-12 gap-6">
          <div className="col-span-7 space-y-6">
            <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h2 className="mb-4 text-lg font-semibold">Add Transaction</h2>
              <form onSubmit={handleSubmit} className="grid grid-cols-12 gap-4">
                <div className="col-span-2">
                  <label className="mb-1 block text-sm text-slate-600">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={form.amount}
                    onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500"
                    placeholder="0.00"
                  />
                </div>

                <div className="col-span-3">
                  <label className="mb-1 block text-sm text-slate-600">Type</label>
                  <div className="grid h-[42px] grid-cols-2 items-center gap-2 rounded-lg border border-slate-300 px-2">
                    <label className="inline-flex min-w-0 items-center justify-center gap-1 overflow-hidden rounded-md border border-slate-200 px-2 py-1 text-xs xl:text-sm">
                      <input
                        type="radio"
                        checked={form.type === 'expense'}
                        onChange={() => handleTypeChange('expense')}
                      />
                      <span className="truncate">Expense</span>
                    </label>
                    <label className="inline-flex min-w-0 items-center justify-center gap-1 overflow-hidden rounded-md border border-slate-200 px-2 py-1 text-xs xl:text-sm">
                      <input
                        type="radio"
                        checked={form.type === 'income'}
                        onChange={() => handleTypeChange('income')}
                      />
                      <span className="truncate">Income</span>
                    </label>
                  </div>
                </div>

                <div className="col-span-2">
                  <label className="mb-1 block text-sm text-slate-600">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500"
                  >
                    {categoryOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-3">
                  <label className="mb-1 block text-sm text-slate-600">Date</label>
                  <input
                    type="date"
                    required
                    value={form.date}
                    onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500"
                  />
                </div>

                <div className="col-span-2">
                  <label className="mb-1 block text-sm text-slate-600">Note</label>
                  <input
                    type="text"
                    value={form.note}
                    onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500"
                    placeholder="Optional"
                  />
                </div>

                <div className="col-span-12">
                  <button
                    type="submit"
                    className="rounded-lg bg-brand-600 px-5 py-2 text-white transition hover:bg-brand-500"
                  >
                    Save Transaction
                  </button>
                </div>
              </form>
            </div>

            <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h2 className="mb-4 text-lg font-semibold">Transaction History (Newest First)</h2>
              <div className="max-h-[430px] overflow-auto">
                <table className="w-full border-collapse text-sm">
                  <thead className="sticky top-0 bg-slate-100">
                    <tr>
                      <th className="border-b border-slate-200 px-3 py-2 text-left">Date</th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left">Type</th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left">Category</th>
                      <th className="border-b border-slate-200 px-3 py-2 text-right">Amount</th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left">Note</th>
                      <th className="border-b border-slate-200 px-3 py-2 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRecords.length === 0 ? (
                      <tr>
                        <td className="px-3 py-6 text-center text-slate-500" colSpan={6}>
                          No data yet. Please add your first transaction.
                        </td>
                      </tr>
                    ) : (
                      sortedRecords.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50">
                          <td className="border-b border-slate-100 px-3 py-2">{r.date}</td>
                          <td className="border-b border-slate-100 px-3 py-2">
                            <span className={r.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}>
                              {r.type === 'income' ? 'Income' : 'Expense'}
                            </span>
                          </td>
                          <td className="border-b border-slate-100 px-3 py-2">{r.category}</td>
                          <td className="border-b border-slate-100 px-3 py-2 text-right">
                            {r.type === 'income' ? '+' : '-'}
                            {formatMoney(r.amount)}
                          </td>
                          <td className="border-b border-slate-100 px-3 py-2">{r.note || '??'}</td>
                          <td className="border-b border-slate-100 px-3 py-2 text-center">
                            <button
                              className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                              onClick={() => handleDelete(r.id)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="col-span-5 space-y-6">
            <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Expense Breakdown (Pie Chart)</h2>
                <button
                  className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100"
                  onClick={() => setShowPiePercent((prev) => !prev)}
                >
                  {showPiePercent ? 'Show Amount' : 'Show Percent'}
                </button>
              </div>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expensePieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, percent, value }) =>
                        showPiePercent ? `${name}: ${(percent * 100).toFixed(1)}%` : `${name}: ${formatMoney(value)}`
                      }
                    >
                      {expensePieData.map((item, index) => (
                        <Cell key={item.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v) =>
                        showPiePercent && totalExpenseValue > 0
                          ? `${((Number(v) / totalExpenseValue) * 100).toFixed(1)}%`
                          : formatMoney(Number(v))
                      }
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Last 7 Days Income vs Expense</h2>
                <button
                  className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100"
                  onClick={() => setTrendMode((m) => (m === 'bar' ? 'line' : 'bar'))}
                >
                  Switch to {trendMode === 'bar' ? 'Line Chart' : 'Bar Chart'}
                </button>
              </div>

              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  {trendMode === 'bar' ? (
                    <BarChart data={trend7DaysData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip formatter={(v) => formatMoney(v)} />
                      <Legend />
                      <Bar dataKey="income" name="Income" fill="#16a34a" />
                      <Bar dataKey="expense" name="Expense" fill="#dc2626" />
                    </BarChart>
                  ) : (
                    <LineChart data={trend7DaysData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip formatter={(v) => formatMoney(v)} />
                      <Legend />
                      <Line type="monotone" dataKey="income" name="Income" stroke="#16a34a" strokeWidth={2} />
                      <Line type="monotone" dataKey="expense" name="Expense" stroke="#dc2626" strokeWidth={2} />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function KpiCard({ title, value, color }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="text-sm text-slate-500">{title}</div>
      <div className={`mt-2 text-2xl font-bold ${color}`}>{value}</div>
    </div>
  )
}

export default App
