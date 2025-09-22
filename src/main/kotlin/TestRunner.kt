import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import local.LoadTest
import kotlin.time.measureTime
import MemoryMetricsCollector.TestType

object TestRunner {
    private val scope = CoroutineScope(context = SupervisorJob() + Dispatchers.IO)

    suspend fun simpleJvmTest() {
        scope.launch {
            MemoryMetricsCollector.runCollectingJvmMetricsStdout {
                val time = measureTime {
                    LoadTest.performNParallelCompletionsChunked(10_000, chunkSize = 1_000)
                }
                println("Total time: $time")
            }
        }.join()
    }

    suspend fun k6MassiveTestToJsonOutput(testType: TestType = TestType.REST) {
        val outFile = "results-jvm-rest.json"
        scope.launch {
            MemoryMetricsCollector.runK6CollectingJvmMetricsJson(testType, outputJson = outFile)
        }.join()
        DataHandler.plotMemoryMetrics(outFile)
    }

    suspend fun k6MassiveTestForGrafanaVisualisation(testType: TestType = TestType.REST) {
        scope.launch {
            MemoryMetricsCollector.runK6CollectingJvmMetricsJson(testType, withInfluxDb = true)
        }.join()
    }
}

fun main() = runBlocking {
    TestRunner.k6MassiveTestForGrafanaVisualisation(TestType.WEBSOCKET)
}
