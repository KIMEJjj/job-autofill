// 지원서 자동입력 – Mac 키체인 도우미 (크롬 Native Messaging)
// 확장의 잠금 해제 열쇠를 macOS 키체인에 보관하고, 꺼낼 때마다 Touch ID 또는 Mac 로그인 암호를 확인합니다.
// 통신: 크롬 ↔ 표준입출력 (4바이트 길이 + JSON). 네트워크를 쓰지 않습니다.
import Foundation
import LocalAuthentication
import Security

let service = "pubfill-vault"
// 실행 기록 (열쇠 값은 남기지 않음): ~/Library/Logs/pubfill-keychain.log
func log(_ s: String) {
    let url = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/pubfill-keychain.log")
    let line = "\(ISO8601DateFormatter().string(from: Date())) \(s)\n"
    if let h = try? FileHandle(forWritingTo: url) { h.seekToEndOfFile(); h.write(Data(line.utf8)); try? h.close() }
    else { try? Data(line.utf8).write(to: url) }
}
let account = "vault-key"

func readMessage() -> [String: Any]? {
    let lenData = FileHandle.standardInput.readData(ofLength: 4)
    guard lenData.count == 4 else { return nil }
    let len = lenData.withUnsafeBytes { $0.load(as: UInt32.self) }
    let body = FileHandle.standardInput.readData(ofLength: Int(len))
    return (try? JSONSerialization.jsonObject(with: body)) as? [String: Any]
}

func send(_ obj: [String: Any]) {
    log("응답 ok=\(obj["ok"] ?? "") error=\(obj["error"] ?? "")")
    guard let data = try? JSONSerialization.data(withJSONObject: obj) else { return }
    var len = UInt32(data.count)
    FileHandle.standardOutput.write(Data(bytes: &len, count: 4))
    FileHandle.standardOutput.write(data)
}

// Touch ID 또는 Mac 로그인 암호 확인
func authenticate(_ reason: String) -> (Bool, String) {
    let ctx = LAContext()
    var err: NSError?
    guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &err) else {
        return (false, err?.localizedDescription ?? "인증을 사용할 수 없습니다")
    }
    let sem = DispatchSemaphore(value: 0)
    var ok = false, msg = ""
    ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { success, e in
        ok = success; msg = e?.localizedDescription ?? ""
        sem.signal()
    }
    sem.wait()
    return (ok, msg)
}

func baseQuery() -> [String: Any] {
    [kSecClass as String: kSecClassGenericPassword,
     kSecAttrService as String: service,
     kSecAttrAccount as String: account]
}

func hasKey() -> Bool {
    var q = baseQuery(); q[kSecReturnAttributes as String] = true
    return SecItemCopyMatching(q as CFDictionary, nil) == errSecSuccess
}

func saveKey(_ key: String) -> OSStatus {
    SecItemDelete(baseQuery() as CFDictionary)
    var q = baseQuery()
    q[kSecValueData as String] = Data(key.utf8)
    q[kSecAttrLabel as String] = "지원서 자동입력 잠금 열쇠"
    q[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
    return SecItemAdd(q as CFDictionary, nil)
}

func loadKey() -> String? {
    var q = baseQuery()
    q[kSecReturnData as String] = true
    q[kSecMatchLimit as String] = kSecMatchLimitOne
    var out: AnyObject?
    guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data else { return nil }
    return String(data: d, encoding: .utf8)
}

// 메시지 하나 처리 후 종료 (chrome.runtime.sendNativeMessage 방식)
log("시작")
guard let msg = readMessage(), let cmd = msg["cmd"] as? String else { send(["ok": false, "error": "잘못된 요청"]); exit(0) }
log("명령 \(cmd)")
switch cmd {
case "status":
    send(["ok": true, "hasKey": hasKey(), "version": "1"])
case "save":
    guard let key = msg["key"] as? String, !key.isEmpty else { send(["ok": false, "error": "열쇠가 없습니다"]); break }
    log("Touch ID 요청 (저장)")
    let (ok, e) = authenticate("지원서 자동입력 잠금 열쇠를 키체인에 저장합니다")
    if !ok { send(["ok": false, "error": e]); break }
    let st = saveKey(key)
    send(st == errSecSuccess ? ["ok": true] : ["ok": false, "error": "키체인 저장 실패 (\(st))"])
case "unlock":
    guard hasKey() else { send(["ok": false, "error": "키체인에 저장된 열쇠가 없습니다"]); break }
    let (ok, e) = authenticate("지원서 자동입력 내 정보 잠금을 해제합니다")
    if !ok { send(["ok": false, "error": e]); break }
    if let k = loadKey() { send(["ok": true, "key": k]) } else { send(["ok": false, "error": "키체인에서 읽지 못했습니다"]) }
case "forget":
    SecItemDelete(baseQuery() as CFDictionary)
    send(["ok": true])
default:
    send(["ok": false, "error": "알 수 없는 명령"])
}
