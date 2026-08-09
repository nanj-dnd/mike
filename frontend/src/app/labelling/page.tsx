import type { Metadata } from "next";
import { LabellingGate } from "./LabellingGate";
import "./labelling.css";

export const metadata: Metadata = {
    title: "AMP Label Lab | Gavel",
    description:
        "Create expert-reviewed cricket video labels and training-ready CSV datasets.",
    robots: {
        index: false,
        follow: false,
        nocache: true,
    },
};

export default function LabellingPage() {
    return <LabellingGate />;
}
