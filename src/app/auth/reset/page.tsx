import { ResetForm } from "@/components/auth/reset-form";
import { Suspense } from "react";

const ResetPage = () => {
    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-violet-950 via-indigo-950 to-slate-950 p-4">
            <Suspense fallback={<div>Loading...</div>}>
                <ResetForm />
            </Suspense>
        </div>
    );
};

export default ResetPage;
