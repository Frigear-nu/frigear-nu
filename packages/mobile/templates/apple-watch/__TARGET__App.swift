import SwiftUI

@main
struct __TARGET__App: App {
    @StateObject private var phone = PhoneSession()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(phone)
        }
    }
}
