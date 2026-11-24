import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var phone: PhoneSession

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "applewatch")
                .imageScale(.large)
                .foregroundStyle(.tint)
            Text("__APP_NAME__")
                .font(.headline)
            Text(phone.isReachable ? "iPhone connected" : "iPhone not reachable")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .padding()
    }
}

#Preview {
    ContentView()
        .environmentObject(PhoneSession())
}
