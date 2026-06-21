export const SEED_DATA = {
  projects: [{ id: "knifex", name: "Knifex", color: "#ef4444" }],
  items: [
    {
      id: "knifex-001",
      projectId: "knifex",
      title: "spring mvc bypass на .cc домене 500 html",
      description:
        "knifex.cc та же инфраструктура что knifex.bet cf ray из варшавы те же пути обхода spring mvc работают все еще возвращают spring html error page 500 новые вариации байпасов также дают 500 например /api/..;/admin/balance и /api/..;/user-service/balance и /api;/admin/add-balance",
      severity: "medium",
      checked: false,
      checkedBy: null,
      checkedAt: null,
      addedAt: "2026-06-11T18:30:00.000Z",
      reporter: "backd00r",
    },
    {
      id: "knifex-002",
      projectId: "knifex",
      title: "сделать редирект с knifex.com на knifex.cc",
      description: "",
      severity: "low",
      checked: false,
      checkedBy: null,
      checkedAt: null,
      addedAt: "2026-06-12T16:24:00.000Z",
      reporter: "backd00r",
    },
  ],
};
