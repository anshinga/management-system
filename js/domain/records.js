function pad(number) {
  return String(number).padStart(2, "0");
}

function compareRecordItems(a, b) {
  return a.dateKey.localeCompare(b.dateKey)
    || (a.arrivalTime || "").localeCompare(b.arrivalTime || "")
    || Number(a.type !== "baseline") - Number(b.type !== "baseline");
}

function validLessonSnapshot(term, lessonNumber) {
  return Number.isInteger(term)
    && term >= 1
    && Number.isInteger(lessonNumber)
    && lessonNumber >= 1
    && lessonNumber <= 24;
}

function snapshotFromProgress(termValue, lessonValue) {
  const term = Number(termValue);
  const lessonNumber = Number(lessonValue);
  if (!Number.isInteger(term) || term < 1 || !Number.isInteger(lessonNumber) || lessonNumber < 0 || lessonNumber > 23) {
    return null;
  }
  if (lessonNumber > 0) return { term, lessonNumber };
  if (term > 1) return { term: term - 1, lessonNumber: 24 };
  return null;
}

function snapshotFromFollowingAttendance(student, attendance) {
  if (!student.previousLessonDate) return null;
  const firstFollowingRecord = attendance
    .filter((item) => item.studentId === student.id && item.dateKey > student.previousLessonDate)
    .sort(compareRecordItems)[0];
  if (!firstFollowingRecord) return null;
  const term = Number(firstFollowingRecord.term);
  const lessonNumber = Number(firstFollowingRecord.lessonNumber);
  if (lessonNumber > 1 && validLessonSnapshot(term, lessonNumber - 1)) {
    return { term, lessonNumber: lessonNumber - 1 };
  }
  if (lessonNumber === 1 && validLessonSnapshot(term - 1, 24)) {
    return { term: term - 1, lessonNumber: 24 };
  }
  return null;
}

export function getBiMonthPeriod(dateKey) {
  const [year, month] = String(dateKey).split("-").map(Number);
  const startMonth = Math.floor((month - 1) / 2) * 2 + 1;
  const endMonth = startMonth + 1;
  const lastDay = new Date(year, endMonth, 0).getDate();
  return {
    key: `${year}-${pad(startMonth)}`,
    label: `${year} 年 ${startMonth}–${endMonth} 月`,
    startDate: `${year}-${pad(startMonth)}-01`,
    endDate: `${year}-${pad(endMonth)}-${pad(lastDay)}`,
  };
}

export function getPreviousLessonSnapshot(student, attendance = []) {
  const storedTerm = Number(student.previousLessonTerm);
  const storedLessonNumber = Number(student.previousLessonNumber);
  if (validLessonSnapshot(storedTerm, storedLessonNumber)) {
    return { term: storedTerm, lessonNumber: storedLessonNumber };
  }
  return snapshotFromFollowingAttendance(student, attendance)
    || snapshotFromProgress(student.currentTerm, student.currentLessonCount);
}

export function resolvePreviousLessonFields(student, input, attendance = []) {
  if (!input.previousLessonDate) {
    return { previousLessonTerm: 0, previousLessonNumber: 0 };
  }
  if (student?.previousLessonDate === input.previousLessonDate) {
    const storedTerm = Number(student.previousLessonTerm);
    const storedLessonNumber = Number(student.previousLessonNumber);
    if (validLessonSnapshot(storedTerm, storedLessonNumber)) {
      return {
        previousLessonTerm: storedTerm,
        previousLessonNumber: storedLessonNumber,
      };
    }
    const inferred = snapshotFromFollowingAttendance(student, attendance);
    if (inferred) {
      return {
        previousLessonTerm: inferred.term,
        previousLessonNumber: inferred.lessonNumber,
      };
    }
  }
  const snapshot = snapshotFromProgress(input.currentTerm, input.currentLessonCount);
  if (!snapshot) {
    throw new Error("填寫上一次上課日期時，目前堂數必須至少有 1 堂。");
  }
  return {
    previousLessonTerm: snapshot.term,
    previousLessonNumber: snapshot.lessonNumber,
  };
}

export function getStudentRecordItems(student, attendance = []) {
  const items = attendance
    .filter((item) => item.studentId === student.id)
    .map((item) => ({
      ...item,
      type: "attendance",
    }));
  if (student.previousLessonDate) {
    const snapshot = getPreviousLessonSnapshot(student, attendance);
    if (snapshot) {
      items.push({
        type: "baseline",
        dateKey: student.previousLessonDate,
        arrivalTime: "",
        term: snapshot.term,
        lessonNumber: snapshot.lessonNumber,
      });
    }
  }
  return items.sort(compareRecordItems);
}

export function getCurrentStudentRecords(student, attendance, todayDate) {
  const period = getBiMonthPeriod(todayDate);
  const records = getStudentRecordItems(student, attendance);
  const currentRecords = records.filter((item) => item.dateKey >= period.startDate && item.dateKey <= period.endDate);
  const previousRecord = records.filter((item) => item.dateKey < period.startDate).at(-1);
  return previousRecord ? [{ ...previousRecord, isCarryover: true }, ...currentRecords] : currentRecords;
}

export function getStudentRecordsForPeriod(student, attendance, periodKey) {
  const period = getBiMonthPeriod(`${periodKey}-01`);
  return getStudentRecordItems(student, attendance)
    .filter((item) => item.dateKey >= period.startDate && item.dateKey <= period.endDate);
}

export function getArchivePeriods(students, attendance, todayDate) {
  const currentPeriod = getBiMonthPeriod(todayDate);
  const periodCounts = new Map();
  students.forEach((student) => {
    getStudentRecordItems(student, attendance)
      .filter((item) => item.dateKey < currentPeriod.startDate)
      .forEach((item) => {
        const period = getBiMonthPeriod(item.dateKey);
        periodCounts.set(period.key, {
          ...period,
          count: Number(periodCounts.get(period.key)?.count || 0) + 1,
        });
      });
  });
  return [...periodCounts.values()].sort((a, b) => b.startDate.localeCompare(a.startDate));
}
