import { NewPasswordForm } from "@/components/auth/new-password-form";
import { Suspense } from "react";

const NewPasswordPage = () => {
    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-violet-950 via-indigo-950 to-slate-950 p-4">
            <Suspense fallback={<div>Loading...</div>}>
                <NewPasswordForm />
            </Suspense>
        </div>
    );
};

export default NewPasswordPage;
