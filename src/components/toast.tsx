import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, CircleAlert, X } from 'lucide-react'

type ToastTone = 'success' | 'error' | 'info'
interface ToastItem { id: string; message: string; tone: ToastTone }
interface ToastContextValue { notify: (message: string, tone?: ToastTone) => void }
const ToastContext = createContext<ToastContextValue>({ notify: () => undefined })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const dismiss = useCallback((id: string) => setItems((current) => current.filter((item) => item.id !== id)), [])
  const notify = useCallback((message: string, tone: ToastTone = 'success') => {
    const id = crypto.randomUUID()
    setItems((current) => [...current, { id, message, tone }])
    window.setTimeout(() => dismiss(id), 4200)
  }, [dismiss])
  const value = useMemo(() => ({ notify }), [notify])
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" aria-live="polite">
        {items.map((item) => <div className={`toast toast-${item.tone}`} key={item.id}>
          {item.tone === 'success' ? <CheckCircle2 size={17} /> : <CircleAlert size={17} />}
          <span>{item.message}</span>
          <button aria-label="关闭提示" onClick={() => dismiss(item.id)}><X size={15} /></button>
        </div>)}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
