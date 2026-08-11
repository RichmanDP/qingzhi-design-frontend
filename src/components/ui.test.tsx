import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusBadge } from './ui'

describe('StatusBadge', () => {
  it('以一致的文字和视觉语义展示关键任务及节点状态', () => {
    render(<div>
      <StatusBadge status="done" />
      <StatusBadge status="running" />
      <StatusBadge status="gate_blocked" />
      <StatusBadge status="awaiting_review" />
      <StatusBadge status="skipped" />
    </div>)

    expect(screen.getByText('已完成')).toHaveClass('badge', 'b-ok')
    expect(screen.getByText('进行中')).toHaveClass('badge', 'b-run')
    expect(screen.getByText('进行中').querySelector('.dot')).toBeInTheDocument()
    expect(screen.getByText('质检拦截')).toHaveClass('badge', 'b-stop')
    expect(screen.getByText('待审批')).toHaveClass('badge', 'b-gold')
    expect(screen.getByText('已跳过')).toHaveClass('badge', 'b-wait')
  })
})
