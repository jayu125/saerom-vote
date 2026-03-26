'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

export default function MeetingClosedPage() {
  const router = useRouter();
  const [sec, setSec] = useState(5);

  useEffect(() => {
    const interval = setInterval(() => setSec((s) => Math.max(0, s - 1)), 1000);
    const t = setTimeout(() => router.push('/'), 5000);
    return () => {
      clearInterval(interval);
      clearTimeout(t);
    };
  }, [router]);

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center max-w-md space-y-6"
      >
        <motion.div
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 2.5, repeat: Infinity }}
          className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-blue to-accent-cyan flex items-center justify-center mx-auto"
        >
          <Sparkles className="w-8 h-8 text-white" />
        </motion.div>
        <p className="text-lg md:text-xl text-text-primary leading-relaxed font-medium">
          시간 내어 대의원회에 참여해주셔서 감사드립니다. 수고하셨습니다!
        </p>
        <p className="text-sm text-text-muted">{sec}초 후 홈으로 이동합니다</p>
      </motion.div>
    </div>
  );
}
