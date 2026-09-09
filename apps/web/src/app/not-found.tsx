import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-xl font-bold text-slate-900">הדף לא נמצא</h1>
      <p className="mt-2 text-slate-600">ייתכן שהרשימה או המועמד הוסרו מהמאגר.</p>
      <Link href="/" className="mt-4 inline-block text-slate-700 underline">
        חזרה לעמוד הראשי
      </Link>
    </div>
  );
}
