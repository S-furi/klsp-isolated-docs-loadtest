import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import local.LoadTest
import kotlin.time.measureTime
import MemoryMetricsCollector.TestType

object TestRunner {
    suspend fun simpleJvmTest() {
        MemoryMetricsCollector.runCollectingJvmMetricsStdout {
            val time = measureTime {
                LoadTest.performNParallelCompletionsChunked(10_000, chunkSize = 1_000)
            }
            println("Total time: $time")
        }
    }

    suspend fun k6MassiveTestToJsonOutput(testType: TestType = TestType.REST_BASIC) {
        val outFile = "results-jvm-rest.json"
        MemoryMetricsCollector.runK6CollectingJvmMetricsJson(testType, outputJson = outFile)
        DataHandler.plotMemoryMetrics(outFile)
    }

    suspend fun k6MassiveTestForGrafanaVisualisation(testType: TestType = TestType.REST_BASIC) {
        MemoryMetricsCollector.runK6CollectingJvmMetricsJson(testType, withInfluxDb = true)
    }
}

fun main() = runBlocking {
    TestRunner.k6MassiveTestForGrafanaVisualisation(TestType.WEBSOCKET_LONG)
}
