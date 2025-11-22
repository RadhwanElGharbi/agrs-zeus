'use client'

import { MainLayout } from '@/components/layout/MainLayout'
import { SimpleMapViewer } from '@/components/Map/SimpleMapViewer'

export default function Home() {
  return (
    <MainLayout>
      <SimpleMapViewer />
    </MainLayout>
  )
}

