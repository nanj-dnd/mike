"use client";

import { useState } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import { useUserProfile } from "@/app/contexts/UserProfileContext";
import { ChatInput } from "./ChatInput";
import { SelectAssistantProjectModal } from "./SelectAssistantProjectModal";
import type { Message } from "../shared/types";

interface InitialViewProps {
    onSubmit: (message: Message) => void;
}

export function InitialView({ onSubmit }: InitialViewProps) {
    const { user } = useAuth();
    const { profile } = useUserProfile();
    const [projectModalOpen, setProjectModalOpen] = useState(false);

    const username =
        profile?.displayName?.trim() || user?.email?.split("@")[0] || "there";

    return (
        <div className="flex flex-col h-full w-full px-6">
            <div className="flex-1 flex flex-col items-center justify-center">
                <div className="flex-col items-center w-full max-w-4xl relative px-0 xl:px-8">
                    <div className="mb-10 flex items-center justify-center">
                        <h1
                            className="text-4xl font-serif font-light text-gray-900"
                        >
                            Hi, {username}
                        </h1>
                    </div>

                    <ChatInput
                        onSubmit={onSubmit}
                        onCancel={() => {}}
                        isLoading={false}
                        onProjectsClick={() => setProjectModalOpen(true)}
                    />

                    <div className="text-center">
                        <p className="text-xs py-3 mb-3 text-gray-500">
                            AI can make mistakes. Answers are not legal advice.
                        </p>
                    </div>
                </div>
            </div>

            <SelectAssistantProjectModal
                open={projectModalOpen}
                onClose={() => setProjectModalOpen(false)}
            />
        </div>
    );
}
