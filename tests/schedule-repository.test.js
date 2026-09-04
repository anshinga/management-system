import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const documents = new Map();
  const transaction = {
    delete: vi.fn(),
    get: vi.fn(async (reference) => ({
      ref: reference,
      exists: () => documents.has(reference.path),
      data: () => documents.get(reference.path),
    })),
    set: vi.fn(),
    update: vi.fn(),
  };
  return { documents, transaction };
});

vi.mock("firebase/firestore", () => ({
  getDocs: vi.fn(async ({ name, constraints }) => ({
    docs: [...mocks.documents.entries()]
      .filter(([path, data]) => path.startsWith(`${name}/`) && constraints.every(({ field, operator, value }) => (
        operator === "==" ? data[field] === value
          : operator === ">" ? data[field] > value
            : operator === ">=" ? data[field] >= value : data[field] <= value
      )))
      .map(([path, data]) => ({ ref: { path }, data: () => data })),
  })),
  query: vi.fn((reference, ...constraints) => ({ ...reference, constraints })),
  runTransaction: vi.fn((database, callback) => callback(mocks.transaction)),
  serverTimestamp: vi.fn(() => "server-time"),
  where: vi.fn((field, operator, value) => ({ field, operator, value })),
}));

vi.mock("../js/firebase/firestore.js", () => ({ db: {} }));

vi.mock("../js/repositories/firestore-paths.js", () => ({
  COLLECTIONS: {
    attendance: "attendance",
    scheduleEntries: "scheduleEntries",
    scheduleOverrides: "scheduleOverrides",
  },
  workspaceCollectionRef: (name) => ({ name }),
  workspaceDocumentRef: (name, id) => ({
    id,
    path: `${name}/${id}`,
  }),
}));

const { addScheduleEntries, addTemporaryScheduleEntries, ensureScheduleWeek, moveScheduleEntry, moveScheduleEntryForDate } = await import(
  "../js/repositories/schedule-repository.js"
);
const { buildCarryForwardEntries, groupScheduleEntries, makeScheduleEntryId, makeScheduleOverrideId } = await import(
  "../js/domain/schedule.js"
);

const source = {
  dateKey: "2026-07-27",
  slot: "15:00",
  seasonId: "summer-2026",
};
const target = {
  dateKey: "2026-07-27",
  slot: "16:30",
  seasonId: "summer-2026",
};
const sourcePath = "scheduleEntries/2026-07-27__15%3A00__student-1";
const targetPath = "scheduleEntries/2026-07-27__16%3A30__student-1";
const overridePath = "scheduleOverrides/2026-07-27__summer-2026__student-1__1__15%3A00";

beforeEach(() => {
  mocks.documents.clear();
  Object.values(mocks.transaction).forEach((method) => method.mockClear());
});

describe("single-day schedule move", () => {
  test("固定排課保留原文件，以覆寫隱藏並建立目標臨時排課", async () => {
    mocks.documents.set(sourcePath, { studentId: "student-1", ...source });

    await moveScheduleEntryForDate("student-1", source, target);

    expect(mocks.transaction.delete).not.toHaveBeenCalled();
    expect(mocks.transaction.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: targetPath }),
      expect.objectContaining({
        studentId: "student-1",
        ...target,
        temporary: true,
      }),
    );
    expect(mocks.transaction.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: overridePath }),
      expect.objectContaining({
        studentId: "student-1",
        seasonId: "summer-2026",
        weekStart: "2026-07-27",
        sourceWeekday: 1,
        sourceSlot: "15:00",
      }),
    );
  });

  test("臨時排課移動時刪除原臨時文件，不建立額外覆寫", async () => {
    mocks.documents.set(sourcePath, {
      studentId: "student-1",
      ...source,
      temporary: true,
    });

    await moveScheduleEntryForDate("student-1", { ...source, temporary: true }, target);

    expect(mocks.transaction.delete).toHaveBeenCalledWith(
      expect.objectContaining({ path: sourcePath }),
    );
    expect(mocks.transaction.set).toHaveBeenCalledTimes(1);
    expect(mocks.transaction.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: targetPath }),
      expect.objectContaining({ temporary: true }),
    );
  });

  test("臨時排課拖回被覆寫的固定時段時恢復原排課", async () => {
    mocks.documents.set(targetPath, {
      studentId: "student-1",
      ...target,
      temporary: true,
    });
    mocks.documents.set(sourcePath, {
      studentId: "student-1",
      ...source,
    });
    mocks.documents.set(overridePath, {
      studentId: "student-1",
      seasonId: "summer-2026",
      weekStart: "2026-07-27",
      sourceWeekday: 1,
      sourceSlot: "15:00",
    });

    await moveScheduleEntryForDate(
      "student-1",
      { ...target, temporary: true },
      source,
    );

    expect(mocks.transaction.delete).toHaveBeenCalledWith(
      expect.objectContaining({ path: targetPath }),
    );
    expect(mocks.transaction.delete).toHaveBeenCalledWith(
      expect.objectContaining({ path: overridePath }),
    );
    expect(mocks.transaction.set).not.toHaveBeenCalled();
  });

  test("目標已有同一學生或原時段已點名時拒絕移動", async () => {
    mocks.documents.set(sourcePath, { studentId: "student-1", ...source });
    mocks.documents.set(targetPath, { studentId: "student-1", ...target });

    await expect(moveScheduleEntryForDate("student-1", source, target))
      .rejects.toThrow("已經在目標時段");

    mocks.documents.delete(targetPath);
    mocks.documents.set(
      "attendance/2026-07-27__15%3A00__student-1",
      { studentId: "student-1", ...source },
    );

    await expect(moveScheduleEntryForDate("student-1", source, target))
      .rejects.toThrow("已完成點名");
  });
});

// Apply only successful transactions to the local fixture, then use the real
// grouping logic to check what the schedule screen will actually display.
function applyWrites() {
  mocks.transaction.set.mock.calls.forEach(([ref, data]) => mocks.documents.set(ref.path, data));
  mocks.transaction.update.mock.calls.forEach(([ref, data]) => mocks.documents.set(ref.path, {
    ...mocks.documents.get(ref.path), ...data,
  }));
  mocks.transaction.delete.mock.calls.forEach(([ref]) => mocks.documents.delete(ref.path));
}

function scheduleState() {
  const entries = [...mocks.documents].filter(([path]) => path.startsWith("scheduleEntries/")).map(([, data]) => data);
  const overrides = [...mocks.documents].filter(([path]) => path.startsWith("scheduleOverrides/")).map(([, data]) => data);
  return { entries, schedules: groupScheduleEntries(entries, overrides) };
}

describe("重新加入被本週例外隱藏的排課", () => {
  const saturday = { dateKey: "2026-09-05", slot: "09:00", seasonId: "fall-2026" };
  const entry = { studentId: "student-1", ...saturday };
  const entryPath = `scheduleEntries/${makeScheduleEntryId(entry)}`;
  const override = {
    studentId: "student-1", seasonId: "fall-2026", weekStart: "2026-08-31",
    sourceWeekday: 6, sourceSlot: "09:00",
  };
  const hiddenPath = `scheduleOverrides/${makeScheduleOverrideId(override)}`;

  beforeEach(() => {
    mocks.documents.set(entryPath, entry);
    mocks.documents.set(hiddenPath, override);
  });

  test("跨學期週六：隱藏的固定排課可重新加入，下一週仍正常沿用", async () => {
    expect(scheduleState().schedules).toEqual([]);
    expect(buildCarryForwardEntries({ previousEntries: [entry], seasonId: "fall-2026" }))
      .toEqual([{ ...entry, dateKey: "2026-09-12" }]);
    expect(await addScheduleEntries(["student-1"], saturday)).toBe(1);
    applyWrites();
    expect(scheduleState().schedules[0]?.studentIds).toEqual(["student-1"]);
    expect(mocks.documents.get(entryPath)).toEqual(entry);
    expect(mocks.documents.has(hiddenPath)).toBe(false);
  });

  test("已移除的固定排課重新加入後立即可見", async () => {
    mocks.documents.delete(entryPath);
    expect(await addScheduleEntries(["student-1"], saturday)).toBe(1);
    applyWrites();
    expect(scheduleState().schedules[0]?.studentIds).toEqual(["student-1"]);
  });

  test("今日臨時加入可恢復隱藏的固定排課，保留其後續沿用", async () => {
    expect(await addTemporaryScheduleEntries(["student-1"], saturday)).toBe(1);
    applyWrites();
    expect(scheduleState().schedules[0]?.studentIds).toEqual(["student-1"]);
    expect(mocks.documents.get(entryPath).temporary).not.toBe(true);
  });

  test("沒有原固定文件時，臨時加入仍保留例外，不恢復後續固定排課", async () => {
    mocks.documents.delete(entryPath);
    expect(await addTemporaryScheduleEntries(["student-1"], saturday)).toBe(1);
    applyWrites();
    expect(scheduleState().schedules[0]?.studentIds).toEqual(["student-1"]);
    expect(mocks.documents.has(hiddenPath)).toBe(true);
    expect(buildCarryForwardEntries({ previousEntries: scheduleState().entries, seasonId: "fall-2026" })).toEqual([]);
  });

  test("已可見的學生重複加入不寫入、不重複計數", async () => {
    mocks.documents.delete(hiddenPath);
    expect(await addScheduleEntries(["student-1", "student-1"], saturday)).toBe(0);
    expect(mocks.transaction.set).not.toHaveBeenCalled();
    expect(mocks.transaction.delete).not.toHaveBeenCalled();
  });

  test("多人加入可同時恢復隱藏學生及新增學生", async () => {
    expect(await addScheduleEntries(["student-1", "student-2", "student-1"], saturday)).toBe(2);
    applyWrites();
    expect(scheduleState().schedules[0]?.studentIds).toEqual(["student-1", "student-2"]);
  });

  test("從學生名單拖入被隱藏的時段後立即可見", async () => {
    await moveScheduleEntry("student-1", null, saturday);
    applyWrites();
    expect(scheduleState().schedules[0]?.studentIds).toEqual(["student-1"]);
  });

  test("固定排課拖回曾移除的時段，不會再次被舊例外隱藏", async () => {
    const moved = { ...saturday, slot: "10:30" };
    const movedPath = `scheduleEntries/${makeScheduleEntryId({ studentId: "student-1", ...moved })}`;
    mocks.documents.set(movedPath, { studentId: "student-1", ...moved });
    await moveScheduleEntry("student-1", moved, saturday);
    applyWrites();
    expect(scheduleState().schedules).toHaveLength(1);
    expect(scheduleState().schedules[0]).toMatchObject({ slot: "09:00", studentIds: ["student-1"] });
    expect(mocks.documents.has(movedPath)).toBe(false);
  });

  test("學期標記不一致時，整批新增拒絕且不覆蓋既有排課", async () => {
    mocks.documents.set(entryPath, { ...entry, seasonId: "summer-2026" });
    await expect(addScheduleEntries(["student-2", "student-1"], saturday)).rejects.toThrow("其他學期");
    expect(mocks.transaction.set).not.toHaveBeenCalled();
    expect(mocks.transaction.delete).not.toHaveBeenCalled();
  });

  test("拖曳目標屬於其他學期時，保留原時段與目標資料", async () => {
    mocks.documents.set(entryPath, { ...entry, seasonId: "summer-2026" });
    await expect(moveScheduleEntry("student-1", { ...saturday, slot: "10:30" }, saturday))
      .rejects.toThrow("其他學期");
    expect(mocks.transaction.set).not.toHaveBeenCalled();
    expect(mocks.transaction.delete).not.toHaveBeenCalled();
  });

  test("被修復顯示的較新排課不再算隱藏，重複加入維持零新增", async () => {
    mocks.documents.set(entryPath, { ...entry, createdAt: "2026-08-26T07:24:16.795Z" });
    mocks.documents.set(hiddenPath, { ...override, updatedAt: "2026-08-26T07:23:58.189Z" });
    expect(scheduleState().schedules[0]?.studentIds).toEqual(["student-1"]);
    expect(await addScheduleEntries(["student-1"], saturday)).toBe(0);
    expect(mocks.transaction.set).not.toHaveBeenCalled();
    expect(mocks.transaction.delete).not.toHaveBeenCalled();
  });

  test("臨時排課不能移入已因較新建立時間而恢復顯示的固定時段", async () => {
    mocks.documents.set(entryPath, { ...entry, createdAt: "2026-08-26T07:24:16.795Z" });
    mocks.documents.set(hiddenPath, { ...override, updatedAt: "2026-08-26T07:23:58.189Z" });
    const temporary = { ...saturday, slot: "10:30", temporary: true };
    mocks.documents.set(`scheduleEntries/${makeScheduleEntryId({ studentId: "student-1", ...temporary })}`, {
      studentId: "student-1", ...temporary,
    });
    await expect(moveScheduleEntryForDate("student-1", temporary, saturday)).rejects.toThrow("已經在目標時段");
    expect(mocks.transaction.delete).not.toHaveBeenCalled();
  });
});

describe("自動沿用與人工例外競爭", () => {
  const previous = { studentId: "s1", seasonId: "fall-2026", dateKey: "2026-09-02", slot: "15:00" };
  const next = { ...previous, dateKey: "2026-09-09" };
  const exclusion = { studentId: "s1", seasonId: "fall-2026", weekStart: "2026-09-07", sourceWeekday: 3, sourceSlot: "15:00" };
  const season = { startDate: "2026-09-01", endDate: "2027-01-31" };

  test("正常沿用仍建立下一週固定排課", async () => {
    mocks.documents.set(`scheduleEntries/${makeScheduleEntryId(previous)}`, previous);
    expect(await ensureScheduleWeek("2026-09-09", "fall-2026", season)).toBe(true);
    applyWrites();
    expect(mocks.documents.get(`scheduleEntries/${makeScheduleEntryId(next)}`)).toMatchObject(next);
  });

  test("初次查詢後才加入的人工例外，也能在交易中阻止自動重建", async () => {
    const { getDocs } = await import("firebase/firestore");
    getDocs.mockResolvedValueOnce({ docs: [{ data: () => previous }] })
      .mockResolvedValueOnce({ docs: [] }).mockResolvedValueOnce({ docs: [] });
    mocks.documents.set(`scheduleOverrides/${makeScheduleOverrideId(exclusion)}`, exclusion);
    expect(await ensureScheduleWeek("2026-09-09", "fall-2026", season)).toBe(false);
    expect(mocks.transaction.set).not.toHaveBeenCalled();
    expect(mocks.transaction.delete).not.toHaveBeenCalled();
  });
});
