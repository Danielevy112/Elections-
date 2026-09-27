/** Party-authored Israeli policy sources, not inferred from historical votes. */
export interface Position { issue: string; summary: string; source: string }
export const positionsByParty: Record<string, Position[]> = {
  "party:k26-01": [
    { issue: "חינוך", summary: "תקצוב ציבורי רק למוסדות עם לימודי ליבה מלאים; שכר התחלתי של 12 אלף שקל למורה.", source: "https://be-yahad.org.il/plans/education/" },
    { issue: "גיוס וביטחון", summary: "גיוס שוויוני ללא פטורים, עם יעד של 20 אלף חיילים נוספים לצה״ל.", source: "https://be-yahad.org.il/plans/national-sec/" },
    { issue: "עסקים קטנים", summary: "צמצום בירוקרטיה ורגולציה, שיפור אשראי ורשת ביטחון לעצמאים.", source: "https://be-yahad.org.il/plans/smb/" },
  ],
  "party:k26-11": [
    { issue: "גיוס", summary: "חוק גיוס חובה לכל אזרח בגיל 18, במסלול צבאי או אזרחי.", source: "https://beytenu.org.il/party-platform/" },
    { issue: "יוקר המחיה", summary: "הפחתת רגולציה, פירוק מונופולים והגברת התחרות.", source: "https://beytenu.org.il/party-platform/" },
    { issue: "דת ומדינה", summary: "נישואין וגירושין אזרחיים ותחבורה ציבורית בשבת לפי החלטת הרשויות המקומיות.", source: "https://beytenu.org.il/party-platform/" },
  ],
  "party:k26-17": [
    { issue: "עזה וביטחון", summary: "פירוז הרצועה, החלפת שלטון חמאס ומנגנוני אכיפה בסיוע אזורי ובינלאומי.", source: "https://democrats.org.il/wp-content/uploads/2026/08/plan-8-26-he.pdf" },
    { issue: "יוקר המחיה", summary: "מאבק בקרטלי מזון, תרופות ואנרגיה והורדת מחירי התחבורה הציבורית.", source: "https://democrats.org.il/wp-content/uploads/2026/08/plan-8-26-he.pdf" },
    { issue: "שירות", summary: "שירות שוויוני לכלל האזרחים, תוך כבוד לאורחות חיים שונים.", source: "https://democrats.org.il/wp-content/uploads/2026/08/plan-8-26-he.pdf" },
  ],
};
