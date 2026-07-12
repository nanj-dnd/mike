"use client";

import { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/app/lib/utils";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { ModalSelect } from "@/app/components/modals/ModalSelect";
import { updateUserProfile } from "@/app/lib/mikeApi";
import {
    ROLE_OPTIONS,
    PRACTICE_TYPE_OPTIONS,
    INDIAN_STATE_OPTIONS,
} from "@/app/lib/profileEnrichmentOptions";

const enrichInputClassName =
    "rounded-lg border border-transparent bg-gray-100 px-3 shadow-none focus-visible:border-gray-200 focus-visible:ring-2 focus-visible:ring-gray-300/45";

/**
 * Post-signup "Almost there" step. Every field is optional; Continue
 * saves whatever was filled, Skip proceeds without saving, and neither
 * ever blocks progression.
 */
export function ProfileEnrichmentStep({ onDone }: { onDone: () => void }) {
    const [role, setRole] = useState("");
    const [practiceTypes, setPracticeTypes] = useState<string[]>([]);
    const [city, setCity] = useState("");
    const [state, setState] = useState("");
    const [saving, setSaving] = useState(false);

    const handleContinue = async () => {
        const payload = {
            ...(role && { role }),
            ...(practiceTypes.length > 0 && { practiceTypes }),
            ...(city.trim() && { city: city.trim() }),
            ...(state && { state }),
        };
        if (Object.keys(payload).length === 0) {
            onDone();
            return;
        }
        setSaving(true);
        try {
            await updateUserProfile(payload);
        } catch (error) {
            // Optional enrichment must never block getting into the app.
            console.error("[signup] failed to save profile details", error);
        }
        onDone();
    };

    return (
        <div>
            <h2 className="text-left text-2xl font-medium font-serif text-gray-950 mb-1">
                Almost there
            </h2>
            <p className="text-sm text-gray-500 mb-6">
                Help us understand your practice better. All fields are
                optional.
            </p>

            <div className="space-y-4">
                <div>
                    <label
                        htmlFor="enrich-role"
                        className="block text-sm font-medium text-gray-700 mb-2"
                    >
                        Role
                    </label>
                    <ModalSelect
                        id="enrich-role"
                        value={role}
                        options={ROLE_OPTIONS}
                        onChange={setRole}
                        placeholder="Select your role"
                    />
                </div>

                <PracticeTypesField
                    value={practiceTypes}
                    onChange={setPracticeTypes}
                />

                <div>
                    <label
                        htmlFor="enrich-city"
                        className="block text-sm font-medium text-gray-700 mb-2"
                    >
                        City
                    </label>
                    <Input
                        id="enrich-city"
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Your city"
                        className={`w-full ${enrichInputClassName}`}
                    />
                </div>

                <div>
                    <label
                        htmlFor="enrich-state"
                        className="block text-sm font-medium text-gray-700 mb-2"
                    >
                        State
                    </label>
                    <ModalSelect
                        id="enrich-state"
                        value={state}
                        options={INDIAN_STATE_OPTIONS}
                        onChange={setState}
                        placeholder="Select your state"
                    />
                </div>

                <div className="flex items-center justify-between gap-3 pt-2">
                    <button
                        type="button"
                        onClick={onDone}
                        disabled={saving}
                        className="text-sm font-medium text-gray-500 transition-colors hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Skip
                    </button>
                    <Button
                        type="button"
                        onClick={handleContinue}
                        disabled={saving}
                        className="bg-black hover:bg-gray-900 text-white px-6"
                    >
                        {saving ? "Saving..." : "Continue"}
                    </Button>
                </div>
            </div>
        </div>
    );
}

function PracticeTypesField({
    value,
    onChange,
}: {
    value: string[];
    onChange: (next: string[]) => void;
}) {
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const available = useMemo(() => {
        const q = query.trim().toLowerCase();
        return PRACTICE_TYPE_OPTIONS.filter(
            (option) =>
                !value.includes(option) &&
                (!q || option.toLowerCase().includes(q)),
        );
    }, [query, value]);

    function add(option: string) {
        onChange([...value, option]);
        setQuery("");
        inputRef.current?.focus();
    }

    function remove(option: string) {
        onChange(value.filter((v) => v !== option));
    }

    return (
        <div>
            <label
                htmlFor="enrich-practice-types"
                className="block text-sm font-medium text-gray-700 mb-2"
            >
                Practice Types
            </label>
            {value.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                    {value.map((option) => (
                        <span
                            key={option}
                            className="inline-flex max-w-full items-center gap-1 rounded-full bg-gray-100 py-0.5 pl-2.5 pr-1 text-xs font-medium text-gray-700"
                        >
                            <span className="truncate">{option}</span>
                            <button
                                type="button"
                                onClick={() => remove(option)}
                                aria-label={`Remove ${option}`}
                                className="rounded-full p-0.5 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </span>
                    ))}
                </div>
            )}
            <div className="relative">
                <Input
                    ref={inputRef}
                    id="enrich-practice-types"
                    type="text"
                    role="combobox"
                    aria-expanded={open}
                    aria-controls="enrich-practice-types-list"
                    aria-autocomplete="list"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    onBlur={() => {
                        // Delay so option clicks land before the list closes.
                        setTimeout(() => setOpen(false), 150);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") setOpen(false);
                        if (e.key === "Enter") {
                            e.preventDefault();
                            if (open && available.length > 0)
                                add(available[0]);
                        }
                        if (
                            e.key === "Backspace" &&
                            !query &&
                            value.length > 0
                        ) {
                            remove(value[value.length - 1]);
                        }
                    }}
                    placeholder="Start typing to search"
                    autoComplete="off"
                    className={`w-full ${enrichInputClassName}`}
                />
                {open && available.length > 0 && (
                    <div
                        id="enrich-practice-types-list"
                        role="listbox"
                        aria-label="Practice types"
                        className="absolute left-0 top-full z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-2xl border border-white/70 bg-gray-50/95 p-1 shadow-[0_12px_32px_rgba(15,23,42,0.156),inset_0_1px_0_rgba(255,255,255,0.86),inset_0_-1px_0_rgba(255,255,255,0.58)] backdrop-blur-2xl"
                    >
                        {available.map((option) => (
                            <button
                                key={option}
                                type="button"
                                role="option"
                                aria-selected={false}
                                // Fire before the input's blur closes the list.
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    add(option);
                                }}
                                className={cn(
                                    "flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-gray-700 transition-all hover:bg-gray-100/70",
                                )}
                            >
                                <span className="truncate">{option}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
